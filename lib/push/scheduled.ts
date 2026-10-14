import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify, pushToUsers } from "@/lib/push/notify";
import { loadNotificationSettings } from "@/lib/push/settings";
import { sendDueAnnouncements } from "@/lib/push/announcements";
import { athensToday } from "@/lib/push/athens-time";

/**
 * Time-based notification work, called by the cron routes. Every function
 * here is safe to run twice (it checks what was already sent) and never
 * throws - a notification problem must never fail the charge run.
 */

const MONTH_NAMES_EL = [
  "Ιανουάριος", "Φεβρουάριος", "Μάρτιος", "Απρίλιος", "Μάιος", "Ιούνιος",
  "Ιούλιος", "Αύγουστος", "Σεπτέμβριος", "Οκτώβριος", "Νοέμβριος", "Δεκέμβριος",
];

/** '2026-10-01' -> 'Οκτώβριος'. */
export function monthNameEl(period: string): string {
  return MONTH_NAMES_EL[Number(period.slice(5, 7)) - 1] ?? "";
}

async function guard(job: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { feature: "push-notifications", job } });
  }
}

/** Records that a job ran, for the App tab's "last run". */
export async function recordJobRun(
  supabase: SupabaseClient,
  job: string,
  forced: boolean,
) {
  await supabase
    .from("notification_job_runs")
    .upsert({ job, last_run_at: new Date().toISOString(), forced });
}

/**
 * Parents of the families this charge run actually charged. The run itself
 * is idempotent, so "charged" = a monthly_charge row for the period created
 * since the run started (a re-run that charged nobody new notifies nobody).
 */
export async function notifyMonthlyCharges(
  supabase: SupabaseClient,
  period: string,
  runStartedAt: Date,
) {
  await guard("monthly_charges", async () => {
    // A minute of slack for clock differences between app and database.
    const since = new Date(runStartedAt.getTime() - 60_000).toISOString();
    const { data } = await supabase
      .from("family_balance_transactions")
      .select("family_id")
      .eq("type", "monthly_charge")
      .eq("period", period)
      .gte("created_at", since);
    const familyIds = [...new Set((data ?? []).map((row) => row.family_id as string))];
    if (familyIds.length === 0) return;
    await notify({
      event: "monthly_charge",
      to: { kind: "family_parents", familyIds },
      values: { month: monthNameEl(period) },
      tag: `monthly-charge-${period}`,
      supabase,
    });
  });
}

/** The automatic charge run failed: tell the teacher straight away. */
export async function notifyChargeRunFailed(supabase: SupabaseClient, period: string) {
  await guard("charge_failed", async () => {
    await notify({
      event: "teacher_charge_failed",
      to: { kind: "teachers" },
      values: { month: monthNameEl(period) },
      tag: `charge-failed-${period}`,
      supabase,
    });
  });
}

/**
 * Once a month, on the chosen day: parents of families with an unpaid
 * balance. The log keeps it to once a month even if the cron runs twice.
 */
export async function sendBalanceReminders(supabase: SupabaseClient, now: Date) {
  await guard("balance_reminder", async () => {
    const settings = await loadNotificationSettings(supabase);
    if (!settings.balance_reminder || settings.paused) return;
    const today = athensToday(now);
    if (Number(today.slice(8, 10)) !== settings.balance_reminder_day) return;

    const monthStart = `${today.slice(0, 7)}-01T00:00:00Z`;
    const { count } = await supabase
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("event", "balance_reminder")
      .gte("created_at", monthStart);
    if (count) return;

    const { data } = await supabase
      .from("families")
      .select("id")
      .gt("balance", 0)
      .is("deleted_at", null);
    const familyIds = (data ?? []).map((row) => row.id as string);
    if (familyIds.length === 0) return;
    await notify({
      event: "balance_reminder",
      to: { kind: "family_parents", familyIds },
      values: {},
      tag: `balance-${today.slice(0, 7)}`,
      supabase,
    });
  });
}

/** Sends the notices held during quiet hours, once their time has come. */
export async function flushQuietHoursQueue(supabase: SupabaseClient, now: Date) {
  await guard("quiet_hours_queue", async () => {
    const { data } = await supabase
      .from("notification_queue")
      .select("id, event, user_ids, title, body, url, tag")
      .is("sent_at", null)
      .lte("send_after", now.toISOString());
    for (const row of data ?? []) {
      // Claim it first, so two overlapping runs can't both send it.
      const { data: claimed } = await supabase
        .from("notification_queue")
        .update({ sent_at: now.toISOString() })
        .eq("id", row.id)
        .is("sent_at", null)
        .select("id");
      if (!claimed || claimed.length === 0) continue;
      await pushToUsers(
        supabase,
        { event: row.event, title: row.title, body: row.body, url: row.url ?? "/start", tag: row.tag ?? undefined },
        row.user_ids,
        "held",
      );
    }
  });
}

/** Keeps the in-portal lists short: notices older than 90 days go. */
export async function pruneInbox(supabase: SupabaseClient, now: Date) {
  await guard("prune_inbox", async () => {
    const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("notification_inbox").delete().lt("created_at", cutoff);
  });
}

/**
 * Everything the morning cron does besides the charge run itself:
 * held notices, greetings, the balance reminder, housekeeping.
 */
export async function runMorningJobs(supabase: SupabaseClient, now: Date = new Date()) {
  await flushQuietHoursQueue(supabase, now);
  await guard("announcements", async () => {
    await sendDueAnnouncements(supabase, { now, force: true });
  });
  await sendBalanceReminders(supabase, now);
  await pruneInbox(supabase, now);
  await guard("record_run", () => recordJobRun(supabase, "morning", true));
}
