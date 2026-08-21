// The Greek school grade a class targets. Stable ASCII codes (stored,
// matches the migration's CHECK constraint) paired with the Greek label
// (display only) - same shape as PAYMENT_METHODS/EXPENSE_CATEGORIES
// elsewhere in this app.
export const CLASS_GRADES: readonly { code: string; label: string }[] = [
  { code: "gym_a", label: "Α Γυμνασίου" },
  { code: "gym_b", label: "Β Γυμνασίου" },
  { code: "gym_c", label: "Γ Γυμνασίου" },
  { code: "lyk_a", label: "Α Λυκείου" },
  { code: "lyk_b", label: "Β Λυκείου" },
  { code: "lyk_c", label: "Γ Λυκείου" },
  { code: "epal_a", label: "Α ΕΠΑ.Λ." },
  { code: "epal_b", label: "Β ΕΠΑ.Λ." },
  { code: "epal_c", label: "Γ ΕΠΑ.Λ." },
  { code: "lyk_grad", label: "Τελειόφοιτοι Λυκείου (ΓΕΛ)" },
  { code: "epal_grad", label: "Τελειόφοιτοι ΕΠΑ.Λ." },
];

export const CLASS_GRADE_LABELS: Record<string, string> = Object.fromEntries(
  CLASS_GRADES.map((grade) => [grade.code, grade.label]),
);
