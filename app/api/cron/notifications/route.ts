import { createServiceRoleClient } from "@/lib/supabase/server";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { sendDueAbsenceNotices } from "@/lib/push/absences";
import { sendEveningReminders } from "@/lib/push/reminders";
import { sendDueAnnouncements } from "@/lib/push/announcements";
import { flushQuietHoursQueue, recordJobRun } from "@/lib/push/scheduled";
import { sendInLessonAttendanceAlerts } from "@/lib/push/attendance-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// When this module was loaded, and whether a request has used it yet - to
// tell a cold start (first request after load) from a warm instance.
const moduleLoadedAt = Date.now();
let servedBefore = false;

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
 *
 * The reply includes `timings` (ms per job, and whether this was a cold
 * start). pg_net stores every reply in net._http_response, so a slow run
 * can be diagnosed from the database without Vercel's logs.
 */
export async function GET(request: Request): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const handlerStartedAt = Date.now();
  const coldStart = !servedBefore;
  servedBefore = true;
  const timings: Record<string, number> = {};
  const timed = async <T>(job: string, work: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      return await work();
    } finally {
      timings[job] = Math.round(performance.now() - started);
    }
  };

  const supabase = createServiceRoleClient();
  const now = new Date();

  const absences = await timed("absences", () => sendDueAbsenceNotices(supabase, now));
  await timed("quietHours", () => flushQuietHoursQueue(supabase, now));
  const announcements = await timed("announcements", () =>
    sendDueAnnouncements(supabase, { now }),
  );
  const reminders = await timed("reminders", () => sendEveningReminders(supabase, { now }));
  const attendanceAlerts = await timed("attendanceAlerts", () =>
    sendInLessonAttendanceAlerts(supabase, now),
  );
  await timed("recordRun", () => recordJobRun(supabase, "frequent", false));

  return Response.json({
    absences,
    announcements,
    reminders,
    attendanceAlerts,
    timings: {
      ...timings,
      totalMs: Date.now() - handlerStartedAt,
      coldStart,
      // On a cold start: how long before the handler ran was the module
      // loaded (≈ the import cost of this route and its dependencies).
      moduleLoadedMsAgo: handlerStartedAt - moduleLoadedAt,
      handlerStartedAt: new Date(handlerStartedAt).toISOString(),
    },
  });
}
