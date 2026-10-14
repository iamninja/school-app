import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deliver, type NotifyResult } from "@/lib/push/notify";
import { resolveRecipients } from "@/lib/push/recipients";
import { athensMinutesNow, athensToday, timeToMinutes } from "@/lib/push/athens-time";
import { isDueToday, type AnnouncementSchedule } from "@/lib/push/greek-holidays";
import { loadNotificationSettings } from "@/lib/push/settings";

export type Announcement = {
  title: string;
  body: string;
  audience: "students" | "parents" | "both";
  classId: string | null;
};

/**
 * Sends a free-text notice (a greeting, "no lessons tomorrow") to the
 * chosen audience. Parents and students get the same words but each opens
 * their own portal.
 */
export async function sendAnnouncement(
  supabase: SupabaseClient,
  announcement: Announcement,
  triggeredBy: string | null,
): Promise<NotifyResult[]> {
  const recipients = await resolveRecipients(
    supabase,
    { kind: "audience", audience: announcement.audience, classId: announcement.classId },
    { parentFallback: false },
  );
  const results: NotifyResult[] = [];
  const notice = { event: "announcement", title: announcement.title, body: announcement.body };
  if (recipients.students.length > 0) {
    results.push(
      await deliver(
        supabase,
        { ...notice, url: "/student-dashboard" },
        recipients.students,
        { audience: "students", triggeredBy },
      ),
    );
  }
  if (recipients.parents.length > 0) {
    results.push(
      await deliver(
        supabase,
        { ...notice, url: "/parent-dashboard" },
        recipients.parents,
        { audience: "parents", triggeredBy },
      ),
    );
  }
  return results;
}

type ScheduledRow = AnnouncementSchedule & {
  id: string;
  title: string;
  body: string;
  audience: Announcement["audience"];
  class_id: string | null;
  send_time: string;
};

/**
 * Sends today's scheduled announcements that haven't gone out yet. With
 * `force` (the daily cron) the send time is ignored; a frequent scheduler
 * calling without it sends each one once its time has passed.
 * Pause stops these too. Never throws.
 */
export async function sendDueAnnouncements(
  supabase: SupabaseClient,
  { now = new Date(), force = false }: { now?: Date; force?: boolean } = {},
): Promise<number> {
  try {
    const settings = await loadNotificationSettings(supabase);
    if (settings.paused) return 0;
    const today = athensToday(now);
    const { data } = await supabase
      .from("scheduled_announcements")
      .select(
        "id, title, body, audience, class_id, recurrence, send_on, send_time, enabled, last_sent_on",
      )
      .eq("enabled", true);

    let sent = 0;
    for (const row of (data ?? []) as ScheduledRow[]) {
      if (!isDueToday(row, today)) continue;
      if (!force && athensMinutesNow(now) < timeToMinutes(row.send_time)) continue;
      // Claim it first, so two overlapping runs can't both send it.
      const { data: claimed } = await supabase
        .from("scheduled_announcements")
        .update({ last_sent_on: today })
        .eq("id", row.id)
        .or(`last_sent_on.is.null,last_sent_on.neq.${today}`)
        .select("id");
      if (!claimed || claimed.length === 0) continue;
      await sendAnnouncement(
        supabase,
        { title: row.title, body: row.body, audience: row.audience, classId: row.class_id },
        null,
      );
      sent++;
    }
    return sent;
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { feature: "push-notifications" } });
    return 0;
  }
}
