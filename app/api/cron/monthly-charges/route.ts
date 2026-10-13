import { timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runMonthlyChargeRun } from "@/lib/billing/monthly-charge-run";
import {
  notifyChargeRunFailed,
  notifyMonthlyCharges,
  runMorningJobs,
} from "@/lib/push/scheduled";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Vercel Cron hits this daily (see vercel.json) - deliberately daily, not
 * monthly-on-the-1st, since post_monthly_family_charges is idempotent
 * (see the family-balance-ledger migration's unique index): the extra 30
 * invocations a month are free no-ops, a failed run on the 1st self-heals
 * the next morning, and a family created mid-month gets billed
 * automatically instead of waiting for next month.
 *
 * The teacher's "Apply this month's charges" button
 * (runMonthlyChargesAction) calls the exact same runMonthlyChargeRun() -
 * this route is a thin, auth-gated wrapper around it, not a second
 * implementation.
 *
 * Runs at 07:00 UTC (09:00/10:00 in Athens) rather than at dawn, because it
 * also sends the morning's notifications (lib/push/scheduled.ts).
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;

  // Fail closed: a missing secret must never be treated as "no auth
  // required" for a publicly-routable endpoint that posts real charges.
  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not configured" },
      { status: 500 },
    );
  }

  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  const authorized =
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer);

  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const startedAt = new Date();

  try {
    const result = await runMonthlyChargeRun({
      supabase,
      source: "cron",
      triggeredBy: null,
    });
    if (result.familiesCharged > 0) {
      await notifyMonthlyCharges(supabase, result.period, startedAt);
    }
    // The morning's notification work (held notices, greetings, balance
    // reminder) rides on this same daily cron. Never throws.
    await runMorningJobs(supabase);
    return Response.json(result, { status: 200 });
  } catch (error: unknown) {
    Sentry.captureException(error);
    const period = new Date().toISOString().slice(0, 7) + "-01";
    await supabase.from("family_charge_runs").insert({
      period,
      source: "cron",
      billable: false,
      families_charged: 0,
      total_amount: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    await notifyChargeRunFailed(supabase, period);
    await runMorningJobs(supabase);
    return Response.json({ error: "Charge run failed" }, { status: 500 });
  }
}
