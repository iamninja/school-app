/**
 * Replaces students.tuition_status (a hand-maintained free-text guess,
 * retired - see TODO.md) with a status derived from the real ledger
 * balance. Pure, no DB.
 */

export type TuitionStatus = "scholarship" | "credit" | "clear" | "due" | "past_due";

export function deriveTuitionStatus(args: {
  balance: number;
  monthlyAmount: number;
}): TuitionStatus {
  if (args.monthlyAmount === 0) return "scholarship";
  if (args.balance < 0) return "credit";
  if (args.balance === 0) return "clear";
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
