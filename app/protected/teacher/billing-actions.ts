"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { runMonthlyChargeRun } from "@/lib/billing/monthly-charge-run";
import { addMonthsToPeriod, currentPeriod } from "@/lib/billing/school-year";
import type {
  ChargeRun,
  FamilyBalanceSummary,
  FamilyBalanceTransaction,
  FamilyLedger,
} from "@/lib/types/database";

const TRANSACTION_COLUMNS =
  "id, family_id, type, amount, period, period_end, covers_months, description, receipt_id, payment_method, source, created_by, created_at";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Deviates slightly from the requireTeacherSession() shape in every other
// action file (which returns just the client): runMonthlyChargesAction
// needs the caller's user id to pass through as triggered_by, so this
// returns both rather than making that one action re-derive it.
async function requireTeacherSession(): Promise<{
  supabase: SupabaseServerClient;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);
  return { supabase, userId: user.id };
}

function toTransaction(row: Record<string, unknown>): FamilyBalanceTransaction {
  return {
    id: row.id as string,
    family_id: row.family_id as string,
    type: row.type as FamilyBalanceTransaction["type"],
    amount: Number(row.amount),
    period: (row.period as string | null) ?? null,
    period_end: (row.period_end as string | null) ?? null,
    covers_months: row.covers_months === null ? null : Number(row.covers_months),
    description: row.description as string,
    receipt_id: (row.receipt_id as string | null) ?? null,
    payment_method:
      row.payment_method === null ? null : Number(row.payment_method),
    source: row.source as FamilyBalanceTransaction["source"],
    created_by: (row.created_by as string | null) ?? null,
    created_at: row.created_at as string,
  };
}

function isFirstOfMonth(period: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(period);
}

// ---------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------

export async function listFamilyBalancesAction(): Promise<
  FamilyBalanceSummary[]
> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: families, error: familiesError } = await supabase
    .from("families")
    .select(
      "id, balance, balance_updated_at, family_parents(name, is_primary)",
    )
    .eq("teacher_id", userId)
    .is("deleted_at", null);

  if (familiesError) {
    throw familiesError;
  }

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("family_id, first_name, last_name, tuition_amount, withdrawn_at")
    .eq("teacher_id", userId);

  if (studentsError) {
    throw studentsError;
  }

  const activeStudentsByFamily = new Map<
    string,
    { names: string[]; monthlyAmount: number }
  >();
  for (const student of students ?? []) {
    if (student.withdrawn_at) continue;
    const entry = activeStudentsByFamily.get(student.family_id) ?? {
      names: [],
      monthlyAmount: 0,
    };
    entry.names.push(`${student.first_name} ${student.last_name}`);
    entry.monthlyAmount += Number(student.tuition_amount ?? 0);
    activeStudentsByFamily.set(student.family_id, entry);
  }

  return (families ?? []).map((family) => {
    const parents = (family.family_parents ??
      []) as unknown as Array<{ name: string | null; is_primary: boolean }>;
    const active = activeStudentsByFamily.get(family.id) ?? {
      names: [],
      monthlyAmount: 0,
    };

    return {
      id: family.id,
      parentNames: parents
        .map((parent) => parent.name)
        .filter((name): name is string => Boolean(name)),
      studentNames: active.names,
      activeStudentCount: active.names.length,
      monthlyAmount: active.monthlyAmount,
      balance: Number(family.balance),
      balanceUpdatedAt: family.balance_updated_at,
    };
  });
}

export async function getFamilyLedgerAction(
  familyId: string,
): Promise<FamilyLedger> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: family, error: familyError } = await supabase
    .from("families")
    .select("id, balance")
    .eq("id", familyId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (familyError) {
    throw familyError;
  }
  if (!family) {
    // RLS already scopes this by ownership - an empty result IS "not
    // yours", same reasoning as receipt-actions.ts's "Receipt not found".
    throw new ExpectedError("Family not found");
  }

  const { data: rows, error: rowsError } = await supabase
    .from("family_balance_transactions")
    .select(TRANSACTION_COLUMNS)
    .eq("family_id", familyId)
    .order("created_at", { ascending: true });

  if (rowsError) {
    throw rowsError;
  }

  let running = 0;
  const withRunning = (rows ?? []).map((row) => {
    const transaction = toTransaction(row);
    running += transaction.amount;
    return { ...transaction, runningBalance: running };
  });
  withRunning.reverse(); // newest first for display

  const { data: activeStudents } = await supabase
    .from("students")
    .select("tuition_amount")
    .eq("family_id", familyId)
    .is("withdrawn_at", null);

  const monthlyAmount = (activeStudents ?? []).reduce(
    (sum, student) => sum + Number(student.tuition_amount ?? 0),
    0,
  );

  return {
    familyId,
    balance: Number(family.balance),
    monthlyAmount,
    transactions: withRunning,
  };
}

export async function listChargeRunsAction(
  limit = 12,
): Promise<ChargeRun[]> {
  const { supabase } = await requireTeacherSession();

  const { data, error } = await supabase
    .from("family_charge_runs")
    .select(
      "id, period, ran_at, source, billable, families_charged, total_amount, skipped_reason, error",
    )
    .order("ran_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    period: row.period,
    ran_at: row.ran_at,
    source: row.source,
    billable: row.billable,
    families_charged: Number(row.families_charged),
    total_amount: Number(row.total_amount),
    skipped_reason: row.skipped_reason,
    error: row.error,
  }));
}

// ---------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------

export interface LogFamilyPaymentInput {
  familyId: string;
  amount: number; // entered POSITIVE by the teacher
  paymentMethod?: number;
  period?: string | null;
  notes?: string;
}

/**
 * Records an informal payment - does NOT touch receipts. A receipt is a
 * legal/tax document with its own numbering and myDATA flow; this is
 * just "money changed hands," for when issuing a receipt hasn't happened
 * (or won't) yet.
 */
export async function logFamilyPaymentAction(
  input: LogFamilyPaymentInput,
): Promise<FamilyBalanceTransaction> {
  const { supabase, userId } = await requireTeacherSession();

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new ExpectedError("Amount must be greater than zero");
  }
  if (input.period && !isFirstOfMonth(input.period)) {
    throw new ExpectedError("Period must be the first day of a month");
  }

  const description = input.notes?.trim()
    ? `Πληρωμή — ${input.notes.trim()}`
    : "Πληρωμή";

  const { data, error } = await supabase
    .from("family_balance_transactions")
    .insert({
      family_id: input.familyId,
      type: "payment",
      // The sign negation happens in exactly one place, here - backed by
      // the DB's sign CHECK as a backstop.
      amount: -input.amount,
      period: input.period ?? null,
      description,
      payment_method: input.paymentMethod ?? 3,
      source: "manual",
      created_by: userId,
    })
    .select(TRANSACTION_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toTransaction(data);
}

export interface PrepaymentPreview {
  periods: string[];
  monthlyAmount: number;
  total: number;
}

export async function previewFamilyPrepaymentAction(input: {
  familyId: string;
  months: number;
}): Promise<PrepaymentPreview> {
  const { supabase } = await requireTeacherSession();

  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 12) {
    throw new ExpectedError("Months must be between 1 and 12");
  }

  const { data, error } = await supabase.rpc("preview_family_prepayment", {
    p_family_id: input.familyId,
    p_months: input.months,
  });

  if (error) {
    throw error;
  }

  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) {
    throw new ExpectedError("Could not compute a prepayment preview");
  }

  return {
    periods: (row.periods as string[]) ?? [],
    monthlyAmount: Number(row.monthly_amount),
    total: Number(row.total),
  };
}

export interface PrepayFamilyMonthsInput {
  familyId: string;
  months: number;
  amountOverride?: number;
  paymentMethod?: number;
  notes?: string;
}

export async function prepayFamilyMonthsAction(
  input: PrepayFamilyMonthsInput,
): Promise<FamilyBalanceTransaction> {
  const { supabase, userId } = await requireTeacherSession();

  const preview = await previewFamilyPrepaymentAction({
    familyId: input.familyId,
    months: input.months,
  });

  const total = input.amountOverride ?? preview.total;
  if (!Number.isFinite(total) || total <= 0) {
    throw new ExpectedError("Amount must be greater than zero");
  }
  if (preview.periods.length === 0) {
    throw new ExpectedError("Could not determine which months this covers");
  }

  const first = preview.periods[0];
  const last = preview.periods[preview.periods.length - 1];
  const label = `${first} – ${last}`;
  const description = input.notes?.trim()
    ? `Προκαταβολή ${input.months} μηνών (${label}) — ${input.notes.trim()}`
    : `Προκαταβολή ${input.months} μηνών (${label})`;

  const { data, error } = await supabase
    .from("family_balance_transactions")
    .insert({
      family_id: input.familyId,
      type: "prepayment",
      amount: -total,
      period: first,
      period_end: last,
      covers_months: input.months,
      description,
      payment_method: input.paymentMethod ?? 3,
      source: "manual",
      created_by: userId,
    })
    .select(TRANSACTION_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toTransaction(data);
}

export interface AdjustFamilyBalanceInput {
  familyId: string;
  amount: number; // SIGNED: negative = credit/discount, positive = extra charge
  description: string;
  period?: string | null;
}

export async function adjustFamilyBalanceAction(
  input: AdjustFamilyBalanceInput,
): Promise<FamilyBalanceTransaction> {
  const { supabase, userId } = await requireTeacherSession();

  const description = input.description.trim();
  if (!description) {
    throw new ExpectedError("Say what this adjustment is for");
  }
  if (!Number.isFinite(input.amount) || input.amount === 0) {
    throw new ExpectedError("Amount can't be zero");
  }
  if (input.period && !isFirstOfMonth(input.period)) {
    throw new ExpectedError("Period must be the first day of a month");
  }

  const { data, error } = await supabase
    .from("family_balance_transactions")
    .insert({
      family_id: input.familyId,
      type: "adjustment",
      amount: input.amount,
      period: input.period ?? null,
      description,
      source: "manual",
      created_by: userId,
    })
    .select(TRANSACTION_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toTransaction(data);
}

export async function deleteFamilyBalanceTransactionAction(
  id: string,
): Promise<void> {
  const { supabase } = await requireTeacherSession();

  const { data: row, error: fetchError } = await supabase
    .from("family_balance_transactions")
    .select("id, type")
    .eq("id", id)
    .single();

  if (fetchError || !row) {
    throw new Error("Transaction not found");
  }

  if (row.type === "receipt") {
    throw new ExpectedError(
      "This credit comes from a receipt — delete the receipt itself and this will go with it.",
    );
  }

  const { error } = await supabase
    .from("family_balance_transactions")
    .delete()
    .eq("id", id);

  if (error) {
    throw error;
  }
}

export async function runMonthlyChargesAction(input?: {
  period?: string;
}): Promise<ReturnType<typeof runMonthlyChargeRun>> {
  const { supabase, userId } = await requireTeacherSession();

  const period = input?.period ?? currentPeriod();
  if (!isFirstOfMonth(period)) {
    throw new ExpectedError("Period must be the first day of a month");
  }
  if (period > addMonthsToPeriod(currentPeriod(), 12)) {
    throw new ExpectedError("You can't post charges more than a year ahead");
  }

  return runMonthlyChargeRun({
    supabase,
    period,
    source: "manual",
    triggeredBy: userId,
  });
}
