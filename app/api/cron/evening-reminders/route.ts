import { createServiceRoleClient } from "@/lib/supabase/server";
import { rejectUnauthorizedCron } from "@/lib/cron-auth";
import { sendEveningReminders } from "@/lib/push/reminders";
import { recordJobRun } from "@/lib/push/scheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily Vercel cron for tonight's reminders (homework, quiz deadlines,
 * tests) - see vercel.json. Runs at 17:00 UTC: 20:00 in Athens in summer,
 * 19:00 in winter. Sends regardless of the App tab's reminder time (only a
 * frequent scheduler, /api/cron/notifications, can honour that exactly).
 * Same auth as the other cron routes; idempotent.
 */
export async function GET(request: Request): Promise<Response> {
  const rejected = rejectUnauthorizedCron(request);
  if (rejected) return rejected;

  const supabase = createServiceRoleClient();
  const reminders = await sendEveningReminders(supabase, { force: true });
  await recordJobRun(supabase, "evening_reminders", true);
  return Response.json({ reminders });
}
