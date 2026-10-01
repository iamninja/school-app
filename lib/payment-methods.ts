// AADE payment-method codes (spec §8.12), narrowed to the ones a tutoring
// centre realistically gets paid by rather than the full list - shared
// between receipts and the billing "log a payment"/"prepay" forms, since
// both are "how did the family pay us" contexts. (teacher-expenses.tsx's
// myDATA-documents card covers the full 1-8 range separately, since that
// context is arbitrary third-party suppliers, not this business's own
// receivables.)
export const PAYMENT_METHODS = [
  { code: 3, label: "Μετρητά (cash)" },
  { code: 7, label: "POS / e-POS (card)" },
  { code: 6, label: "Web banking / transfer" },
  { code: 8, label: "IRIS" },
] as const;

export const PAYMENT_METHOD_LABELS: Record<number, string> = Object.fromEntries(
  PAYMENT_METHODS.map((method) => [method.code, method.label]),
);

// Greek law: a payment above 500 EUR may not be made in cash - 500 or less
// is fine. One constant and one predicate, shared by every server action,
// the forms, and mirrored by the receipts_cash_limit DB check.
export const CASH_PAYMENT_CODE = 3;
export const CASH_PAYMENT_LIMIT = 500;

export function isCashAllowed(amount: number): boolean {
  return amount <= CASH_PAYMENT_LIMIT;
}

export const CASH_LIMIT_MESSAGE =
  "Πληρωμές άνω των 500 € δεν επιτρέπονται σε μετρητά – επιλέξτε κάρτα, έμβασμα ή IRIS.";
