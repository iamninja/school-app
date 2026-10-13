import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient, type TableResponse } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/push/web-push", () => ({
  isPushConfigured: vi.fn(() => true),
  sendPush: vi.fn(async () => ({ ok: true })),
}));

import { isPushConfigured, sendPush } from "@/lib/push/web-push";
import { notify } from "@/lib/push/notify";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/push/settings";

type MockClient = ReturnType<typeof createMockSupabaseClient>;

/** Every call of `method` on queries against `table`, as argument lists. */
function calls(client: MockClient, table: string, method: string): unknown[][] {
  return client.from.mock.calls.flatMap((call, i) =>
    call[0] === table ? client.from.mock.results[i].value[method].mock.calls : [],
  );
}

function makeClient(overrides: Record<string, TableResponse | TableResponse[]> = {}) {
  return createMockSupabaseClient({
    notification_settings: { data: DEFAULT_NOTIFICATION_SETTINGS, error: null },
    classes: { data: { notifications_muted: false }, error: null },
    notification_templates: { data: [], error: null },
    students: {
      data: [
        { id: "s1", user_id: "student-user-1", family_id: "f1", withdrawn_at: null, families: { deleted_at: null } },
      ],
      error: null,
    },
    family_parents: {
      data: [{ user_id: "parent-user-1", families: { deleted_at: null } }],
      error: null,
    },
    student_class_assignments: {
      data: [
        { students: { id: "s1", user_id: "student-user-1", family_id: "f1", withdrawn_at: null, families: { deleted_at: null } } },
        // No login: reached through the parents when fallback is on.
        { students: { id: "s2", user_id: null, family_id: "f2", withdrawn_at: null, families: { deleted_at: null } } },
        // Withdrawn: never notified.
        { students: { id: "s3", user_id: "student-user-3", family_id: "f3", withdrawn_at: "2026-01-01", families: { deleted_at: null } } },
      ],
      error: null,
    },
    push_subscriptions: {
      data: [{ id: "sub-1", endpoint: "https://push.example/1", p256dh: "k", auth: "a" }],
      error: null,
    },
    notification_inbox: { data: null, error: null },
    notification_log: { data: null, error: null },
    notification_queue: { data: null, error: null },
    ...overrides,
  });
}

const asClient = (client: MockClient) => client as unknown as SupabaseClient;

describe("notify", () => {
  beforeEach(() => {
    vi.mocked(sendPush).mockReset().mockResolvedValue({ ok: true });
    vi.mocked(isPushConfigured).mockReturnValue(true);
  });

  it("sends a class notice to its active students, and to the parents of students without a login", async () => {
    const client = makeClient();
    const result = await notify({
      event: "homework",
      to: { kind: "class_students", classId: "c1" },
      values: { class: "Β' Λυκείου", note: "σελ. 42" },
      classId: "c1",
      supabase: asClient(client),
    });

    expect(result.outcome).toBe("sent");
    const inboxRows = calls(client, "notification_inbox", "insert").map((c) => c[0]);
    expect(inboxRows).toEqual([
      [expect.objectContaining({ user_id: "student-user-1", title: "Νέα εργασία · Β' Λυκείου", url: "/student-dashboard" })],
      // Parent fallback: same words, but it opens the parents' portal.
      [expect.objectContaining({ user_id: "parent-user-1", url: "/parent-dashboard" })],
    ]);
    expect(sendPush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://push.example/1" }),
      expect.objectContaining({ title: "Νέα εργασία · Β' Λυκείου", body: "σελ. 42" }),
    );
  });

  it("sends nothing when the notice's switch is off", async () => {
    const client = makeClient({
      notification_settings: { data: { ...DEFAULT_NOTIFICATION_SETTINGS, homework: false }, error: null },
    });
    const result = await notify({
      event: "homework",
      to: { kind: "class_students", classId: "c1" },
      values: {},
      supabase: asClient(client),
    });
    expect(result.outcome).toBe("switched_off");
    expect(calls(client, "notification_inbox", "insert")).toEqual([]);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("pause and class mute stop family notices but not the teacher's own alerts", async () => {
    const paused = makeClient({
      notification_settings: { data: { ...DEFAULT_NOTIFICATION_SETTINGS, paused: true }, error: null },
      teachers: { data: [{ user_id: "teacher-1" }], error: null },
    });
    expect(
      (await notify({ event: "receipt", to: { kind: "family_parents", familyIds: ["f1"] }, values: {}, supabase: asClient(paused) })).outcome,
    ).toBe("paused");
    expect(
      (await notify({ event: "teacher_charge_failed", to: { kind: "teachers" }, values: { month: "Οκτώβριος" }, supabase: asClient(paused) })).outcome,
    ).toBe("sent");

    const muted = makeClient({ classes: { data: { notifications_muted: true }, error: null } });
    expect(
      (await notify({ event: "homework", to: { kind: "class_students", classId: "c1" }, values: {}, classId: "c1", supabase: asClient(muted) })).outcome,
    ).toBe("class_muted");
  });

  it("does not use parent fallback when it's switched off", async () => {
    const client = makeClient({
      notification_settings: { data: { ...DEFAULT_NOTIFICATION_SETTINGS, parent_fallback: false }, error: null },
    });
    await notify({ event: "homework", to: { kind: "class_students", classId: "c1" }, values: {}, supabase: asClient(client) });
    const users = calls(client, "notification_inbox", "insert").flatMap((c) =>
      (c[0] as { user_id: string }[]).map((row) => row.user_id),
    );
    expect(users).toEqual(["student-user-1"]);
  });

  it("uses the teacher's edited text", async () => {
    const client = makeClient({
      notification_templates: {
        data: [{ event: "receipt", title: "Η απόδειξή σας {receipt}", body: "Ευχαριστούμε!" }],
        error: null,
      },
    });
    await notify({ event: "receipt", to: { kind: "family_parents", familyIds: ["f1"] }, values: { receipt: "Α-9" }, supabase: asClient(client) });
    expect(sendPush).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: "Η απόδειξή σας Α-9", body: "Ευχαριστούμε!", url: "/parent-dashboard" }),
    );
  });

  it("sends absences to the student and the parents, each with their own text", async () => {
    const client = makeClient();
    await notify({
      event: "absence_student",
      parentEvent: "absence_parent",
      to: { kind: "student_and_parents", studentId: "s1" },
      values: { class: "Β1", date: "14/10", student: "Μαρία" },
      supabase: asClient(client),
    });
    const titles = calls(client, "notification_inbox", "insert").map(
      (c) => (c[0] as { title: string }[])[0].title,
    );
    expect(titles).toEqual(["Απουσία · Β1", "Απουσία · Μαρία"]);
  });

  it("holds notices during quiet hours instead of pushing them", async () => {
    const client = makeClient({
      notification_settings: {
        data: { ...DEFAULT_NOTIFICATION_SETTINGS, quiet_hours_enabled: true, quiet_start: "22:00", quiet_end: "08:00" },
        error: null,
      },
    });
    const result = await notify({
      event: "receipt",
      to: { kind: "family_parents", familyIds: ["f1"] },
      values: { receipt: "Α-1" },
      supabase: asClient(client),
      now: new Date("2026-12-01T21:30:00Z"), // 23:30 in Athens
    });
    expect(result.outcome).toBe("held");
    expect(sendPush).not.toHaveBeenCalled();
    expect(calls(client, "notification_queue", "insert")[0][0]).toEqual(
      expect.objectContaining({ user_ids: ["parent-user-1"], send_after: "2026-12-02T06:00:00.000Z" }),
    );
    // Still in the in-portal list straight away.
    expect(calls(client, "notification_inbox", "insert")).toHaveLength(1);
  });

  it("forgets devices the push service says are gone and logs the failure", async () => {
    vi.mocked(sendPush).mockResolvedValue({ ok: false, gone: true, error: "410" });
    const client = makeClient();
    const result = await notify({ event: "receipt", to: { kind: "family_parents", familyIds: ["f1"] }, values: {}, supabase: asClient(client) });
    expect(result).toEqual(expect.objectContaining({ delivered: 0, failed: 1 }));
    expect(calls(client, "push_subscriptions", "delete")).toHaveLength(1);
    expect(calls(client, "push_subscriptions", "in")).toContainEqual(["id", ["sub-1"]]);
    expect(calls(client, "notification_log", "insert")[0][0]).toEqual(
      expect.objectContaining({ event: "receipt", outcome: "sent", devices: 1, delivered: 0, failed: 1 }),
    );
  });

  it("still fills the in-portal list when push isn't configured", async () => {
    vi.mocked(isPushConfigured).mockReturnValue(false);
    const client = makeClient();
    const result = await notify({ event: "receipt", to: { kind: "family_parents", familyIds: ["f1"] }, values: {}, supabase: asClient(client) });
    expect(result.outcome).toBe("not_configured");
    expect(calls(client, "notification_inbox", "insert")).toHaveLength(1);
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("never throws, whatever goes wrong", async () => {
    const client = makeClient();
    client.from.mockImplementation(() => {
      throw new Error("database down");
    });
    await expect(
      notify({ event: "homework", to: { kind: "class_students", classId: "c1" }, values: {}, supabase: asClient(client) }),
    ).resolves.toEqual(expect.objectContaining({ outcome: "error" }));
  });
});
