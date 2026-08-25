// Display-only Greek label maps for the parent/student dashboards. The
// underlying stored values (day abbreviations, status enums) stay in
// English/as-is in the database and in teacher-facing UI - these are purely
// presentational lookups for the two Greek-language views.

export const DAY_LABELS_EL: Record<string, string> = {
  Mon: "Δευ",
  Tue: "Τρι",
  Wed: "Τετ",
  Thu: "Πεμ",
  Fri: "Παρ",
  Sat: "Σαβ",
  Sun: "Κυρ",
};

export const ATTENDANCE_STATUS_LABELS_EL: Record<string, string> = {
  present: "Παρών",
  late: "Άργησε",
  absent: "Απουσία",
};

// Replaces the retired tuition_status - see lib/billing/tuition-status.ts
// (deriveTuitionStatus) for the English teacher-facing equivalent.
export const BALANCE_TRANSACTION_TYPE_LABELS_EL: Record<string, string> = {
  monthly_charge: "Χρέωση μήνα",
  payment: "Πληρωμή",
  receipt: "Απόδειξη",
  prepayment: "Προκαταβολή",
  adjustment: "Διόρθωση",
};

// Kept total over CalendarEventType even though "trial_lesson"/"block" are
// unreachable in the portals (RLS excludes them by construction) - a
// partial map would risk an undefined render if that assumption ever
// changes.
export const CALENDAR_EVENT_TYPE_LABELS_EL: Record<string, string> = {
  cancellation: "Ακύρωση",
  extra_session: "Έκτακτο μάθημα",
  ad_hoc_lesson: "Ιδιαίτερο μάθημα",
  trial_lesson: "Δοκιμαστικό μάθημα",
  block: "Προσωπικό",
};
