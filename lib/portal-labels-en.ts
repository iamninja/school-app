// English counterparts to lib/greek-labels.ts, used only by the public
// /demo-en preview page - no real family ever sees these, the portals
// themselves are Greek-only.

import { format } from "date-fns";
import { enUS } from "date-fns/locale";

import { fromIsoDate } from "@/lib/calendar-projection";

export const DAY_LABELS_EN: Record<string, string> = {
  Mon: "Mon",
  Tue: "Tue",
  Wed: "Wed",
  Thu: "Thu",
  Fri: "Fri",
  Sat: "Sat",
  Sun: "Sun",
};

export const ATTENDANCE_STATUS_LABELS_EN: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  split: "1+1",
};

export const BALANCE_TRANSACTION_TYPE_LABELS_EN: Record<string, string> = {
  monthly_charge: "Monthly charge",
  payment: "Payment",
  receipt: "Receipt",
  prepayment: "Prepayment",
  adjustment: "Adjustment",
};

export const CALENDAR_EVENT_TYPE_LABELS_EN: Record<string, string> = {
  cancellation: "Cancelled",
  extra_session: "Extra session",
  ad_hoc_lesson: "Private lesson",
  trial_lesson: "Trial lesson",
  block: "Personal",
};

export const ASSESSMENT_KIND_LABELS_EN: Record<string, string> = {
  short_assessment: "Test",
  mock_exam: "Mock exam",
};

// "registered"/"taken" cover the not-yet-graded states; "marked" is
// deliberately absent here - the portal shows the score badge instead of a
// status badge once a mark exists (mirrors greek-labels.ts).
export const ASSESSMENT_STATUS_LABELS_EN: Record<string, string> = {
  registered: "Scheduled",
  taken: "Grading in progress",
};

export const ASSESSMENT_OVERDUE_LABEL_EN = "Overdue";
export const ASSESSMENT_TAKEN_LATE_LABEL_EN = "Taken late";

export function formatClassDateRangeEn(
  startDate: string | null | undefined,
  finishDate: string | null | undefined,
): string | null {
  if (!startDate && !finishDate) {
    return null;
  }
  const fmt = (iso: string) =>
    format(fromIsoDate(iso), "d MMM yyyy", { locale: enUS });
  if (startDate && finishDate) {
    return `${fmt(startDate)} – ${fmt(finishDate)}`;
  }
  if (startDate) {
    return `from ${fmt(startDate)}`;
  }
  return `until ${fmt(finishDate!)}`;
}
