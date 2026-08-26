import "server-only";

import { currentPeriod } from "@/lib/billing/school-year";

/**
 * The single orchestrator both the cron route and the manual
 * "Apply this month's charges" server action call - one implementation,
 * two callers, so the cron is never a single point of failure and can
 * never diverge from what the manual button does. Accepts whichever
 * Supabase client it's handed: service-role for the cron (no user
 * session exists there), the teacher's own session for the manual
 * action (so that path stays RLS-enforced on top of the function's own
 * is_teacher() guard).
 */

export interface MonthlyChargeRunResult {
  period: string;
  billable: boolean;
  familiesCharged: number;
  totalAmount: number;
  skippedReason: "not_a_billable_month" | "no_families_with_charges" | null;
}

// Structurally matches both createClient()'s and createServiceRoleClient()'s
// return type closely enough for the one .rpc() call this needs.
interface SupabaseClientLike {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

export async function runMonthlyChargeRun(options: {
  supabase: SupabaseClientLike;
  period?: string;
  source: "cron" | "manual";
  triggeredBy?: string | null;
}): Promise<MonthlyChargeRunResult> {
  const period = options.period ?? currentPeriod();

  const { data, error } = await options.supabase.rpc(
    "post_monthly_family_charges",
    {
      p_period: period,
      p_source: options.source,
      p_triggered_by: options.triggeredBy ?? null,
    },
  );

  if (error) {
    throw error;
  }

  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) {
    throw new Error("post_monthly_family_charges returned no row");
  }

  return {
    period: row.period as string,
    billable: Boolean(row.billable),
    familiesCharged: Number(row.families_charged),
    totalAmount: Number(row.total_amount),
    skippedReason:
      (row.skipped_reason as MonthlyChargeRunResult["skippedReason"]) ?? null,
  };
}
