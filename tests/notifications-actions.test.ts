import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers({ "user-agent": "Test Browser" })),
}));

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import * as actions from "@/app/notifications/actions";
import { POST as resubscribe } from "@/app/api/push/resubscribe/route";
import { getErrorMessage } from "@/lib/expected-error";

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" },
};

function setup(user: { id: string } | null = { id: "parent-1" }) {
  const userClient = createMockSupabaseClient({}, user);
  const admin = createMockSupabaseClient({
    push_subscriptions: { data: null, error: null },
  });
  vi.mocked(createClient).mockResolvedValue(userClient as never);
  vi.mocked(createServiceRoleClient).mockReturnValue(admin as never);
  return { userClient, admin };
}

describe("notification server actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exports only the intended actions", () => {
    expect(Object.keys(actions).sort()).toEqual([
      "getInboxAction",
      "markInboxReadAction",
      "removePushSubscriptionAction",
      "savePushSubscriptionAction",
    ]);
  });

  it("saves this device for the signed-in user only", async () => {
    const { admin } = setup();
    await actions.savePushSubscriptionAction(subscription);
    const upsert = admin.from.mock.results[0].value.upsert;
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "parent-1",
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: "Test Browser",
      },
      { onConflict: "endpoint" },
    );
  });

  it.each([
    ["not an object", "nope"],
    ["an http endpoint", { ...subscription, endpoint: "http://insecure.example/x" }],
    ["missing keys", { endpoint: subscription.endpoint }],
    ["a key with odd characters", { ...subscription, keys: { ...subscription.keys, auth: "<script>" } }],
    ["a huge endpoint", { ...subscription, endpoint: `https://x.example/${"a".repeat(2000)}` }],
  ])("rejects %s with a readable message", async (_label, input) => {
    const { admin } = setup();
    const error = await actions.savePushSubscriptionAction(input).catch((e) => e);
    expect(getErrorMessage(error, "")).toBe("Η συσκευή έστειλε μη έγκυρα στοιχεία ειδοποιήσεων.");
    expect(admin.from).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    setup(null);
    await expect(actions.savePushSubscriptionAction(subscription)).rejects.toThrow("Not authenticated");
  });

  it("removes only the caller's own device", async () => {
    const { admin } = setup();
    await actions.removePushSubscriptionAction(subscription.endpoint);
    const chain = admin.from.mock.results[0].value;
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("user_id", "parent-1");
    expect(chain.eq).toHaveBeenCalledWith("endpoint", subscription.endpoint);
  });

  it("marks only the caller's own notices read", async () => {
    const { userClient } = setup();
    await actions.markInboxReadAction("all");
    const chain = userClient.from.mock.results[0].value;
    expect(chain.update).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(chain.eq).toHaveBeenCalledWith("user_id", "parent-1");
  });
});

describe("POST /api/push/resubscribe", () => {
  beforeEach(() => vi.clearAllMocks());

  const request = (body: unknown) =>
    new Request("https://www.modusmath.gr/api/push/resubscribe", {
      method: "POST",
      body: JSON.stringify(body),
    });

  it("rejects a request without a session", async () => {
    setup(null);
    const response = await resubscribe(request({ oldEndpoint: null, subscription }));
    expect(response.status).toBe(401);
  });

  it("won't replace a subscription the user doesn't own", async () => {
    const { admin } = setup();
    // maybeSingle() lookup of the old endpoint finds nothing for this user.
    admin.from.mockImplementation(
      createMockSupabaseClient({ push_subscriptions: { data: null, error: null } }).from,
    );
    const response = await resubscribe(
      request({ oldEndpoint: "https://push.example/someone-else", subscription }),
    );
    expect(response.status).toBe(404);
  });

  it("swaps the user's old device subscription for the new one", async () => {
    const { admin } = setup();
    admin.from.mockImplementation(
      createMockSupabaseClient({
        push_subscriptions: [
          { data: { id: "sub-old" }, error: null },
          { data: null, error: null },
          { data: null, error: null },
        ],
      }).from,
    );
    const response = await resubscribe(
      request({ oldEndpoint: "https://push.example/old", subscription }),
    );
    expect(response.status).toBe(200);
  });

  it("rejects a malformed subscription", async () => {
    setup();
    const response = await resubscribe(request({ oldEndpoint: null, subscription: { endpoint: "x" } }));
    expect(response.status).toBe(400);
  });
});
