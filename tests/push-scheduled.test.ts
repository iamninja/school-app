import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/push/notify", () => ({
  notify: vi.fn(async () => ({ outcome: "sent" })),
  pushToUsers: vi.fn(async () => ({ outcome: "sent" })),
}));
vi.mock("@/lib/push/announcements", () => ({
  sendDueAnnouncements: vi.fn(async () => 0),
}));

import { notify, pushToUsers } from "@/lib/push/notify";
import { sendDueAnnouncements } from "@/lib/push/announcements";
import {
  flushQuietHoursQueue,
  monthNameEl,
  notifyMonthlyCharges,
  runMorningJobs,
  sendBalanceReminders,
} from "@/lib/push/scheduled";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/push/settings";

const asClient = (client: ReturnType<typeof createMockSupabaseClient>) =>
  client as unknown as SupabaseClient;

// 10 Oct 2026, 09:00 in Athens.
const TENTH = new Date("2026-10-10T06:00:00Z");

beforeEach(() => vi.clearAllMocks());

describe("monthly charge notices", () => {
  it("notifies the parents of each family charged in this run, once each", async () => {
    const client = createMockSupabaseClient({
      family_balance_transactions: {
        data: [{ family_id: "f1" }, { family_id: "f2" }, { family_id: "f1" }],
        error: null,
      },
    });
    await notifyMonthlyCharges(asClient(client), "2026-10-01", TENTH);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "monthly_charge",
        to: { kind: "family_parents", familyIds: ["f1", "f2"] },
        values: { month: "Οκτώβριος" },
      }),
    );
  });

  it("names the month in Greek", () => {
    expect(monthNameEl("2027-01-01")).toBe("Ιανουάριος");
  });
});

describe("unpaid balance reminder", () => {
  const settings = { ...DEFAULT_NOTIFICATION_SETTINGS, balance_reminder: true, balance_reminder_day: 10 };

  it("reminds families that owe money, on the chosen day", async () => {
    const client = createMockSupabaseClient({
      notification_settings: { data: settings, error: null },
      notification_log: { data: null, error: null, count: 0 },
      families: { data: [{ id: "f1" }], error: null },
    });
    await sendBalanceReminders(asClient(client), TENTH);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "balance_reminder",
        to: { kind: "family_parents", familyIds: ["f1"] },
      }),
    );
  });

  it("sends nothing on other days, when switched off, or twice in a month", async () => {
    const otherDay = createMockSupabaseClient({
      notification_settings: { data: { ...settings, balance_reminder_day: 11 }, error: null },
    });
    await sendBalanceReminders(asClient(otherDay), TENTH);

    const off = createMockSupabaseClient({
      notification_settings: { data: { ...settings, balance_reminder: false }, error: null },
    });
    await sendBalanceReminders(asClient(off), TENTH);

    const alreadySent = createMockSupabaseClient({
      notification_settings: { data: settings, error: null },
      notification_log: { data: null, error: null, count: 1 },
      families: { data: [{ id: "f1" }], error: null },
    });
    await sendBalanceReminders(asClient(alreadySent), TENTH);

    expect(notify).not.toHaveBeenCalled();
  });
});

describe("quiet-hours queue", () => {
  it("sends each held notice once, after claiming it", async () => {
    const held = {
      id: "n1",
      event: "receipt",
      user_ids: ["parent-1"],
      title: "Νέα απόδειξη Α-1",
      body: "Πατήστε για λεπτομέρειες.",
      url: "/parent-dashboard",
      tag: null,
    };
    const client = createMockSupabaseClient({
      notification_queue: [
        { data: [held], error: null },
        { data: [{ id: "n1" }], error: null }, // claimed
      ],
    });
    await flushQuietHoursQueue(asClient(client), TENTH);
    expect(pushToUsers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ event: "receipt", title: "Νέα απόδειξη Α-1" }),
      ["parent-1"],
      "held",
    );
  });

  it("skips a notice another run already claimed", async () => {
    const client = createMockSupabaseClient({
      notification_queue: [
        { data: [{ id: "n1", user_ids: ["p"], title: "t", body: "b", url: null, tag: null, event: "receipt" }], error: null },
        { data: [], error: null },
      ],
    });
    await flushQuietHoursQueue(asClient(client), TENTH);
    expect(pushToUsers).not.toHaveBeenCalled();
  });
});

describe("morning run", () => {
  it("sends today's greetings (ignoring their time) and records the run, even if a step fails", async () => {
    vi.mocked(sendDueAnnouncements).mockRejectedValueOnce(new Error("boom"));
    const client = createMockSupabaseClient({
      notification_queue: { data: [], error: null },
      notification_settings: { data: DEFAULT_NOTIFICATION_SETTINGS, error: null },
      notification_inbox: { data: null, error: null },
      notification_job_runs: { data: null, error: null },
    });
    await expect(runMorningJobs(asClient(client), TENTH)).resolves.toBeUndefined();
    expect(sendDueAnnouncements).toHaveBeenCalledWith(expect.anything(), { now: TENTH, force: true });
    expect(client.from.mock.calls.map(([table]) => table)).toContain("notification_job_runs");
  });
});
