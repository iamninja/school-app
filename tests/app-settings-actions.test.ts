import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));
vi.mock("@/lib/auth/require-teacher", () => ({ requireTeacher: vi.fn() }));
vi.mock("@/lib/push/web-push", () => ({
  isPushConfigured: vi.fn(() => true),
  sendPush: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/lib/push/announcements", () => ({ sendAnnouncement: vi.fn(async () => []) }));

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { sendAnnouncement } from "@/lib/push/announcements";
import * as actions from "@/app/protected/teacher/app-settings-actions";
import { getErrorMessage } from "@/lib/expected-error";
import { DEFAULT_NOTIFICATION_SETTINGS } from "@/lib/push/settings";

function setup() {
  const client = createMockSupabaseClient({
    notification_settings: { data: DEFAULT_NOTIFICATION_SETTINGS, error: null },
    notification_templates: { data: null, error: null },
    scheduled_announcements: { data: null, error: null },
  });
  vi.mocked(createClient).mockResolvedValue(client as never);
  vi.mocked(createServiceRoleClient).mockReturnValue(
    createMockSupabaseClient({ push_subscriptions: { data: [], error: null } }) as never,
  );
  return client;
}

const message = (promise: Promise<unknown>) =>
  promise.then(
    () => "resolved",
    (error) => getErrorMessage(error, ""),
  );

describe("App tab actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("every action refuses a non-teacher before touching anything", async () => {
    const client = setup();
    vi.mocked(requireTeacher).mockRejectedValue(new Error("Not authorized as a teacher"));
    const calls = [
      actions.getAppSettingsAction(),
      actions.updateNotificationSettingsAction({ paused: true }),
      actions.setClassNotificationsMutedAction("c1", true),
      actions.saveNotificationTemplateAction("homework", "a", "b"),
      actions.resetNotificationTemplateAction("homework"),
      actions.sendTestNotificationAction(),
      actions.saveAnnouncementAction({ title: "a", body: "b", audience: "both", classId: null, recurrence: "now", sendOn: null, sendTime: "10:00" }),
      actions.setAnnouncementEnabledAction("a1", false),
      actions.deleteAnnouncementAction("a1"),
    ];
    for (const call of calls) {
      await expect(call).rejects.toThrow("Not authorized as a teacher");
    }
    expect(client.from).not.toHaveBeenCalled();
    expect(sendAnnouncement).not.toHaveBeenCalled();
  });

  it("saves a valid switch change", async () => {
    const client = setup();
    await actions.updateNotificationSettingsAction({ receipts: false, homework_reminder_time: "19:30" });
    const update = client.from.mock.results[0].value.update;
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ receipts: false, homework_reminder_time: "19:30" }),
    );
  });

  it.each([
    [{ receipts: "yes" }, "Invalid value for receipts."],
    [{ quiet_start: "25:00" }, "Times must look like 20:00."],
    [{ balance_reminder_day: 31 }, "The reminder day must be between 1 and 28."],
    [{ absence_timing: "tomorrow" }, "Invalid absence timing."],
    [{ is_admin: true }, "Unknown setting: is_admin."],
  ])("rejects %j", async (changes, expected) => {
    setup();
    expect(await message(actions.updateNotificationSettingsAction(changes as never))).toBe(expected);
  });

  it("refuses an edited text with a placeholder the notice doesn't offer", async () => {
    const client = setup();
    expect(
      await message(actions.saveNotificationTemplateAction("receipt", "Απόδειξη", "Ποσό {amount}")),
    ).toBe("Μη διαθέσιμα πεδία για αυτή την ειδοποίηση: {amount}.");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("saves and resets an edited text", async () => {
    const client = setup();
    await actions.saveNotificationTemplateAction("receipt", " Απόδειξη {receipt} ", "Ευχαριστούμε");
    expect(client.from.mock.results[0].value.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ event: "receipt", title: "Απόδειξη {receipt}", body: "Ευχαριστούμε" }),
    );
    await actions.resetNotificationTemplateAction("receipt");
    expect(client.from.mock.results[1].value.delete).toHaveBeenCalled();
    expect(await message(actions.resetNotificationTemplateAction("nope" as never))).toBe(
      "Unknown notification.",
    );
  });

  it("sends a 'now' announcement straight away and schedules the rest", async () => {
    const client = setup();
    const base = { title: "Καλά Χριστούγεννα!", body: "Χρόνια πολλά!", audience: "both" as const, classId: null, sendTime: "10:00" };
    expect(await actions.saveAnnouncementAction({ ...base, recurrence: "now", sendOn: null })).toEqual({ sent: true });
    expect(sendAnnouncement).toHaveBeenCalledWith(
      expect.anything(),
      { title: base.title, body: base.body, audience: "both", classId: null },
      "teacher-1",
    );

    await actions.saveAnnouncementAction({ ...base, recurrence: "yearly_date", sendOn: "2026-12-25" });
    expect(client.from.mock.results.at(-1)!.value.insert).toHaveBeenCalledWith(
      expect.objectContaining({ recurrence: "yearly_date", send_on: "2026-12-25", created_by: "teacher-1" }),
    );

    expect(
      await message(actions.saveAnnouncementAction({ ...base, recurrence: "once", sendOn: null })),
    ).toBe("Choose a date.");
  });
});
