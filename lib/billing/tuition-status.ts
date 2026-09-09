/**
 * Replaces students.tuition_status (a hand-maintained free-text guess,
 * retired - see TODO.md) with a status derived from the real ledger
 * balance. Pure, no DB.
 */

export type TuitionStatus = "scholarship" | "credit" | "clear" | "due" | "past_due";

export function deriveTuitionStatus(args: {
  balance: number;
  monthlyAmount: number;
  // A family whose only accrual is per-lesson legitimately has
  // monthlyAmount 0 (tuition_amount is left null so the monthly run
  // doesn't double-charge them) - without this they'd be badged
  // "Scholarship" while genuinely owing money.
  billsPerLesson?: boolean;
}): TuitionStatus {
  if (args.monthlyAmount === 0 && !args.billsPerLesson) return "scholarship";
  if (args.balance < 0) return "credit";
  if (args.balance === 0) return "clear";
  // No monthly figure to compare a per-lesson family's balance against, so
  // there's no basis for a "past due" grace threshold - just "due".
  if (args.monthlyAmount === 0) return "due";
  if (args.balance <= args.monthlyAmount) return "due";
  return "past_due";
}

export const TUITION_STATUS_LABELS_EN: Record<TuitionStatus, string> = {
  scholarship: "Scholarship",
  credit: "Credit",
  clear: "Clear",
  due: "Due",
  past_due: "Past due",
};

export const TUITION_STATUS_LABELS_EL: Record<TuitionStatus, string> = {
  scholarship: "Υποτροφία",
  credit: "Πίστωση",
  clear: "Εξοφλημένο",
  due: "Οφειλή",
  past_due: "Ληξιπρόθεσμο",
};
