import { parse } from "date-fns";
import type { TeacherAssessmentAssignmentRow, AssessmentKind } from "@/lib/types/database";

// Pure - no Supabase import, directly unit-testable. Shared by
// assessments-actions.ts (attaches isLate before returning rows to the
// client), the Assessments tab, the Calendar tab's read-only overlay, and
// the class/student detail tie-ins, so every caller derives "late" the
// same way instead of each re-implementing the comparison.
//
// Lateness is NEVER stored as a status - assessment_assignments.taken_at
// is set once and never overwritten again, so deriving from it here is
// what makes "late" survive a taken -> marked transition (the whole point
// of the feature): before taken_at is set, lateness is a live comparison
// against now(); once set, it's a permanent comparison against that fixed
// instant.

function fromIsoDate(iso: string): Date {
  return parse(iso, "yyyy-MM-dd", new Date());
}

export interface AssessmentDueAtInput {
  kind: AssessmentKind;
  effectiveScheduledDate: string | null;
  effectiveScheduledTime: string | null;
  effectiveDeadlineAt: string | null;
}

/**
 * The instant an assessment assignment is due. short_assessment uses its
 * deadline (null = open, never due). mock_exam uses its scheduled date, at
 * the given time if one is set, else end-of-day local time.
 */
export function computeDueAt(input: AssessmentDueAtInput): Date | null {
  if (input.kind === "short_assessment") {
    return input.effectiveDeadlineAt ? new Date(input.effectiveDeadlineAt) : null;
  }

  if (!input.effectiveScheduledDate) {
    return null;
  }
  const day = fromIsoDate(input.effectiveScheduledDate);
  if (input.effectiveScheduledTime) {
    const [hours, minutes] = input.effectiveScheduledTime.split(":").map(Number);
    day.setHours(hours, minutes, 0, 0);
  } else {
    day.setHours(23, 59, 59, 999);
  }
  return day;
}

export interface AssessmentAssignmentLateInput extends AssessmentDueAtInput {
  takenAt: string | null;
}

export function isAssessmentAssignmentLate(
  input: AssessmentAssignmentLateInput,
  now: Date = new Date(),
): boolean {
  const dueAt = computeDueAt(input);
  if (!dueAt) {
    return false;
  }
  if (input.takenAt) {
    return new Date(input.takenAt).getTime() > dueAt.getTime();
  }
  return now.getTime() > dueAt.getTime();
}

/**
 * Replaces the one row matching `updated.id`, leaving every other row
 * untouched. Pure - callers own the setState call. Same shape as
 * lib/attendance-records.ts's upsertAttendanceRecord, for sharing lifted
 * assessmentAssignments state between the Assessments tab and the
 * Calendar overlay.
 */
export function upsertAssessmentAssignment(
  list: TeacherAssessmentAssignmentRow[],
  updated: TeacherAssessmentAssignmentRow,
): TeacherAssessmentAssignmentRow[] {
  return [updated, ...list.filter((row) => row.id !== updated.id)];
}
