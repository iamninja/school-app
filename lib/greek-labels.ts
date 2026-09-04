// Display-only Greek label maps for the parent/student dashboards. The
// underlying stored values (day abbreviations, status enums) stay in
// English/as-is in the database and in teacher-facing UI - these are purely
// presentational lookups for the two Greek-language views.

import { format } from "date-fns";
import { el } from "date-fns/locale";

import { fromIsoDate } from "@/lib/calendar-projection";

/**
 * "από 1 Σεπ 2026" / "έως 15 Ιουν 2027" / "1 Σεπ 2026 – 15 Ιουν 2027",
 * for a class's optional start/finish date on the student/parent dashboards
 * - null when neither is set, so callers can skip rendering entirely rather
 * than showing an empty badge.
 */
export function formatClassDateRangeEl(
  startDate: string | null | undefined,
  finishDate: string | null | undefined,
): string | null {
  if (!startDate && !finishDate) {
    return null;
  }
  const fmt = (iso: string) =>
    format(fromIsoDate(iso), "d MMM yyyy", { locale: el });
  if (startDate && finishDate) {
    return `${fmt(startDate)} – ${fmt(finishDate)}`;
  }
  if (startDate) {
    return `από ${fmt(startDate)}`;
  }
  return `έως ${fmt(finishDate!)}`;
}

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
  split: "1+1",
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

export const TEST_KIND_LABELS_EL: Record<string, string> = {
  short_test: "Τεστ",
  mock_exam: "Διαγώνισμα",
};

// "registered"/"taken" cover the not-yet-graded states; "marked" is
// deliberately absent here - the portal shows the score badge instead of a
// status badge once a test is marked (see TestRow in parent-dashboard.tsx /
// student-dashboard.tsx).
export const TEST_STATUS_LABELS_EL: Record<string, string> = {
  registered: "Προγραμματισμένο",
  taken: "Σε βαθμολόγηση",
};

// Two distinct late sub-cases (lib/test-status.ts): a test whose deadline
// passed and still hasn't been taken, vs. one that WAS taken/marked but
// after its deadline - the latter must stay visible even once graded,
// which is the whole point of deriving "late" from a permanent taken_at
// rather than storing it as a status.
export const TEST_OVERDUE_LABEL_EL = "Εκπρόθεσμο";
export const TEST_TAKEN_LATE_LABEL_EL = "Έγινε εκπρόθεσμα";
