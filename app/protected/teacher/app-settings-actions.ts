"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  EDITABLE_EVENTS,
  validateTemplate,
  type MessageOverride,
  type NotificationEvent,
} from "@/lib/push/messages";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  loadNotificationSettings,
  type NotificationSettings,
} from "@/lib/push/settings";
import { isPushConfigured } from "@/lib/push/web-push";
import { pushToUsers } from "@/lib/push/notify";
import { sendAnnouncement } from "@/lib/push/announcements";
import { athensToday } from "@/lib/push/athens-time";
import { nextSendDate } from "@/lib/push/greek-holidays";

/**
 * The teacher's "App" tab: notification switches, texts, greetings, and
 * who has notifications on. Every export is a public endpoint, so each one
 * checks for a teacher first; the service-role client is used only after
 * that, for reading other people's device counts.
 */

async function requireTeacherSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await requireTeacher(supabase, user.id);
  return { supabase, user };
}

const TIME = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

export type FamilyNotificationStatus = {
  familyId: string;
  students: { name: string; hasLogin: boolean; devices: number }[];
  parents: { name: string; hasLogin: boolean; devices: number }[];
};

export type NotificationLogRow = {
  id: string;
  event: string;
  audience: string;
  title: string;
  body: string;
  recipient_users: number;
  devices: number;
  delivered: number;
  failed: number;
  outcome: string;
  created_at: string;
};

export type ScheduledAnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience: "students" | "parents" | "both";
  class_id: string | null;
  recurrence: "once" | "yearly_date" | "yearly_orthodox_easter";
  send_on: string | null;
  send_time: string;
  enabled: boolean;
  last_sent_on: string | null;
  next_send_on: string | null;
};

export type AppSettingsData = {
  configured: boolean;
  settings: NotificationSettings;
  templates: Partial<Record<NotificationEvent, MessageOverride>>;
  classes: { id: string; name: string; muted: boolean }[];
  reach: { students: number; parents: number; teacher: number };
  families: FamilyNotificationStatus[];
  log: NotificationLogRow[];
  jobRuns: { job: string; last_run_at: string; forced: boolean }[];
  /** Something has called /api/cron/notifications in the last 30 minutes. */
  frequentSchedulerActive: boolean;
  announcements: ScheduledAnnouncementRow[];
};

export async function getAppSettingsAction(): Promise<AppSettingsData> {
  const { supabase, user } = await requireTeacherSession();
  const admin = createServiceRoleClient();

  const [
    settings,
    templatesResult,
    classesResult,
    studentsResult,
    parentsResult,
    subscriptionsResult,
    logResult,
    jobRunsResult,
    announcementsResult,
  ] = await Promise.all([
    loadNotificationSettings(supabase),
    supabase.from("notification_templates").select("event, title, body"),
    supabase
      .from("classes")
      .select("id, name, notifications_muted, archived_at")
      .is("archived_at", null)
      .order("name"),
    admin
      .from("students")
      .select("id, first_name, last_name, user_id, family_id, withdrawn_at, families(deleted_at)")
      .is("withdrawn_at", null),
    admin.from("family_parents").select("id, name, email, user_id, family_id"),
    admin.from("push_subscriptions").select("user_id"),
    supabase
      .from("notification_log")
      .select(
        "id, event, audience, title, body, recipient_users, devices, delivered, failed, outcome, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(30),
    supabase.from("notification_job_runs").select("job, last_run_at, forced"),
    supabase
      .from("scheduled_announcements")
      .select(
        "id, title, body, audience, class_id, recurrence, send_on, send_time, enabled, last_sent_on",
      )
      .order("created_at", { ascending: false }),
  ]);

  const devicesByUser = new Map<string, number>();
  for (const row of subscriptionsResult.data ?? []) {
    devicesByUser.set(row.user_id, (devicesByUser.get(row.user_id) ?? 0) + 1);
  }
  const devicesOf = (userId: string | null) =>
    userId ? devicesByUser.get(userId) ?? 0 : 0;

  type StudentRow = {
    id: string;
    first_name: string;
    last_name: string;
    user_id: string | null;
    family_id: string;
    families: { deleted_at: string | null } | null;
  };
  const students = ((studentsResult.data ?? []) as unknown as StudentRow[]).filter(
    (s) => !s.families?.deleted_at,
  );
  const activeFamilies = new Set(students.map((s) => s.family_id));
  const parents = (parentsResult.data ?? []).filter((p) => activeFamilies.has(p.family_id));

  const families = new Map<string, FamilyNotificationStatus>();
  const familyOf = (familyId: string) => {
    let family = families.get(familyId);
    if (!family) {
      family = { familyId, students: [], parents: [] };
      families.set(familyId, family);
    }
    return family;
  };
  for (const s of students) {
    familyOf(s.family_id).students.push({
      name: `${s.first_name} ${s.last_name}`.trim(),
      hasLogin: Boolean(s.user_id),
      devices: devicesOf(s.user_id),
    });
  }
  for (const p of parents) {
    familyOf(p.family_id).parents.push({
      name: p.name || p.email || "Parent",
      hasLogin: Boolean(p.user_id),
      devices: devicesOf(p.user_id),
    });
  }

  const templates: AppSettingsData["templates"] = {};
  for (const row of templatesResult.data ?? []) {
    templates[row.event as NotificationEvent] = { title: row.title, body: row.body };
  }

  const today = athensToday();
  return {
    configured: isPushConfigured(),
    settings,
    templates,
    classes: (classesResult.data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      muted: c.notifications_muted,
    })),
    reach: {
      students: students.filter((s) => devicesOf(s.user_id) > 0).length,
      parents: parents.filter((p) => devicesOf(p.user_id) > 0).length,
      teacher: devicesOf(user.id),
    },
    families: [...families.values()].sort((a, b) =>
      (a.students[0]?.name ?? "").localeCompare(b.students[0]?.name ?? "", "el"),
    ),
    log: (logResult.data ?? []) as NotificationLogRow[],
    jobRuns: jobRunsResult.data ?? [],
    frequentSchedulerActive: (jobRunsResult.data ?? []).some(
      (run) =>
        run.job === "frequent" &&
        Date.now() - Date.parse(run.last_run_at) < 30 * 60 * 1000,
    ),
    announcements: ((announcementsResult.data ?? []) as Omit<
      ScheduledAnnouncementRow,
      "next_send_on"
    >[]).map((a) => ({ ...a, next_send_on: nextSendDate(a, today) })),
  };
}

const BOOLEAN_SETTINGS = (
  Object.keys(DEFAULT_NOTIFICATION_SETTINGS) as (keyof NotificationSettings)[]
).filter((key) => typeof DEFAULT_NOTIFICATION_SETTINGS[key] === "boolean");

/** Saves any subset of the switches and options. */
export async function updateNotificationSettingsAction(
  changes: Partial<NotificationSettings>,
): Promise<NotificationSettings> {
  const { supabase } = await requireTeacherSession();
  const update: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(changes ?? {})) {
    if ((BOOLEAN_SETTINGS as string[]).includes(key)) {
      if (typeof value !== "boolean") throw new ExpectedError(`Invalid value for ${key}.`);
      update[key] = value;
    } else if (
      key === "quiet_start" ||
      key === "quiet_end" ||
      key === "homework_reminder_time"
    ) {
      if (typeof value !== "string" || !TIME.test(value)) {
        throw new ExpectedError("Times must look like 20:00.");
      }
      update[key] = value;
    } else if (key === "absence_timing") {
      if (value !== "immediate" && value !== "after_lesson") {
        throw new ExpectedError("Invalid absence timing.");
      }
      update[key] = value;
    } else if (key === "balance_reminder_day") {
      if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 28) {
        throw new ExpectedError("The reminder day must be between 1 and 28.");
      }
      update[key] = value;
    } else {
      throw new ExpectedError(`Unknown setting: ${key}.`);
    }
  }

  if (Object.keys(update).length > 0) {
    const { error } = await supabase
      .from("notification_settings")
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
  }
  return loadNotificationSettings(supabase);
}

export async function setClassNotificationsMutedAction(classId: string, muted: boolean) {
  const { supabase, user } = await requireTeacherSession();
  if (typeof classId !== "string" || typeof muted !== "boolean") {
    throw new ExpectedError("Invalid request.");
  }
  const { error } = await supabase
    .from("classes")
    .update({ notifications_muted: muted })
    .eq("id", classId)
    .eq("teacher_id", user.id);
  if (error) throw new Error(error.message);
}

function assertEvent(event: unknown): asserts event is NotificationEvent {
  if (!EDITABLE_EVENTS.includes(event as NotificationEvent)) {
    throw new ExpectedError("Unknown notification.");
  }
}

export async function saveNotificationTemplateAction(
  event: NotificationEvent,
  title: string,
  body: string,
): Promise<MessageOverride> {
  const { supabase } = await requireTeacherSession();
  assertEvent(event);
  if (typeof title !== "string" || typeof body !== "string") {
    throw new ExpectedError("Invalid text.");
  }
  const errors = validateTemplate(event, title, body);
  if (errors.length > 0) throw new ExpectedError(errors.join(" "));

  const saved = { title: title.trim(), body: body.trim() };
  const { error } = await supabase
    .from("notification_templates")
    .upsert({ event, ...saved, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return saved;
}

export async function resetNotificationTemplateAction(event: NotificationEvent) {
  const { supabase } = await requireTeacherSession();
  assertEvent(event);
  const { error } = await supabase
    .from("notification_templates")
    .delete()
    .eq("event", event);
  if (error) throw new Error(error.message);
}

/** A test notice to the teacher's own devices. */
export async function sendTestNotificationAction(): Promise<{
  devices: number;
  delivered: number;
}> {
  const { user } = await requireTeacherSession();
  if (!isPushConfigured()) {
    throw new ExpectedError("Notifications aren't configured on the server yet (VAPID keys).");
  }
  const result = await pushToUsers(
    createServiceRoleClient(),
    {
      event: "test",
      title: "Δοκιμαστική ειδοποίηση",
      body: "Οι ειδοποιήσεις του Modus λειτουργούν σε αυτή τη συσκευή.",
      url: "/protected/teacher",
      tag: "test",
    },
    [user.id],
    "teacher",
    user.id,
  );
  if (result.outcome === "no_devices") {
    throw new ExpectedError("None of your devices has notifications on. Turn them on above first.");
  }
  return { devices: result.delivered + result.failed, delivered: result.delivered };
}

// ---- Greetings & scheduled notices ----

export type AnnouncementInput = {
  title: string;
  body: string;
  audience: "students" | "parents" | "both";
  classId: string | null;
  recurrence: "now" | "once" | "yearly_date" | "yearly_orthodox_easter";
  sendOn: string | null;
  sendTime: string;
};

function parseAnnouncement(input: AnnouncementInput) {
  const title = typeof input?.title === "string" ? input.title.trim() : "";
  const body = typeof input?.body === "string" ? input.body.trim() : "";
  if (!title || title.length > 60) throw new ExpectedError("The title must be 1-60 characters.");
  if (!body || body.length > 180) throw new ExpectedError("The text must be 1-180 characters.");
  if (!["students", "parents", "both"].includes(input.audience)) {
    throw new ExpectedError("Choose who receives it.");
  }
  if (input.classId !== null && typeof input.classId !== "string") {
    throw new ExpectedError("Invalid class.");
  }
  if (!["now", "once", "yearly_date", "yearly_orthodox_easter"].includes(input.recurrence)) {
    throw new ExpectedError("Choose when to send it.");
  }
  const needsDate = input.recurrence === "once" || input.recurrence === "yearly_date";
  if (needsDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.sendOn ?? "")) {
    throw new ExpectedError("Choose a date.");
  }
  if (input.recurrence === "once" && (input.sendOn ?? "") < athensToday()) {
    throw new ExpectedError("The date is in the past.");
  }
  const sendTime = input.sendTime || "10:00";
  if (!TIME.test(sendTime)) throw new ExpectedError("Times must look like 10:00.");
  return {
    title,
    body,
    audience: input.audience,
    classId: input.classId,
    recurrence: input.recurrence,
    sendOn: needsDate ? input.sendOn : null,
    sendTime,
  };
}

/** "Send now" sends straight away; anything else is saved for later. */
export async function saveAnnouncementAction(
  input: AnnouncementInput,
  id?: string,
): Promise<{ sent: boolean }> {
  const { supabase, user } = await requireTeacherSession();
  const parsed = parseAnnouncement(input);

  if (parsed.recurrence === "now") {
    if (!isPushConfigured()) {
      throw new ExpectedError("Notifications aren't configured on the server yet (VAPID keys).");
    }
    await sendAnnouncement(
      createServiceRoleClient(),
      {
        title: parsed.title,
        body: parsed.body,
        audience: parsed.audience,
        classId: parsed.classId,
      },
      user.id,
    );
    return { sent: true };
  }

  const row = {
    title: parsed.title,
    body: parsed.body,
    audience: parsed.audience,
    class_id: parsed.classId,
    recurrence: parsed.recurrence,
    send_on: parsed.sendOn,
    send_time: parsed.sendTime,
  };
  const { error } = id
    ? await supabase
        .from("scheduled_announcements")
        .update({ ...row, last_sent_on: null })
        .eq("id", id)
    : await supabase
        .from("scheduled_announcements")
        .insert({ ...row, created_by: user.id });
  if (error) throw new Error(error.message);
  return { sent: false };
}

export async function setAnnouncementEnabledAction(id: string, enabled: boolean) {
  const { supabase } = await requireTeacherSession();
  if (typeof enabled !== "boolean") throw new ExpectedError("Invalid request.");
  const { error } = await supabase
    .from("scheduled_announcements")
    .update({ enabled })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteAnnouncementAction(id: string) {
  const { supabase } = await requireTeacherSession();
  const { error } = await supabase.from("scheduled_announcements").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
