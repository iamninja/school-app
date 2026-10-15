import { createServiceRoleClient } from "@/lib/supabase/server";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { sendDueAbsenceNotices } from "@/lib/push/absences";
import { sendEveningReminders } from "@/lib/push/reminders";
import { sendDueAnnouncements } from "@/lib/push/announcements";
import { flushQuietHoursQueue, recordJobRun } from "@/lib/push/scheduled";
import { sendInLessonAttendanceAlerts } from "@/lib/push/attendance-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Time-based notifications for the frequent scheduler: Supabase pg_cron
 * calls this every 10 minutes during teaching hours (see the
 * attendance-alerts migration; it needs the Vault secrets app_base_url and
 * cron_secret). Vercel Hobby only runs daily crons, which cover the morning
 * (/api/cron/monthly-charges) and the evening reminders
 * (/api/cron/evening-reminders). This adds:
 *   - "attendance not taken" alerts while a lesson is running,
 *   - "2 hours after the lesson" absence notices,
 *   - greetings at their exact time, and held notices as soon as quiet
 *     hours end,
 *   - evening reminders at the exact App-tab time.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`. Every job is idempotent, so
 * calling too often never sends anything twice.
 */
export async function GET(request: Request): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const supabase = createServiceRoleClient();
  const now = new Date();

  const absences = await sendDueAbsenceNotices(supabase, now);
  await flushQuietHoursQueue(supabase, now);
  const announcements = await sendDueAnnouncements(supabase, { now });
  const reminders = await sendEveningReminders(supabase, { now });
  const attendanceAlerts = await sendInLessonAttendanceAlerts(supabase, now);
  await recordJobRun(supabase, "frequent", false);
  return Response.json({ absences, announcements, reminders, attendanceAlerts });
}
