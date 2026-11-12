import { athensDateAndTime } from "@/lib/push/athens-time";
import { searchKey } from "@/lib/task-tags";
import type {
  AssessmentKind,
  TeacherAssessmentAssignmentRow,
  TeacherAssessmentListItem,
} from "@/lib/types/database";

// The console's Assessments tab, sorted into what needs doing (components/
// teacher-assessments.tsx). Pure - unit-tested in tests/assessment-list.test.ts.
//
//   Needs attention - someone's date has passed and they haven't taken it,
//                     a paper is waiting for its mark, or no one is on it.
//   Upcoming        - everyone still to take it, and no one late yet.
//   Done            - everyone marked.
//
// Each group is sorted by the assessment's own date, not by when it was
// made. Earlier school years are left out unless asked for.

export type AssessmentGroup = "attention" | "upcoming" | "done";

/** September, as in the billing tab (business_profile.school_year_start_month's default). */
export const SCHOOL_YEAR_START_MONTH = 9;

export interface AssessmentProgress {
  count: number;
  /** Taken, waiting for a mark. */
  toMark: number;
  marked: number;
  /** Still to take, and already past their own date or deadline. */
  overdue: number;
  /** Taken (or marked) after their date - the "late" badge. */
  late: number;
}

export interface AssessmentListRow {
  assessment: TeacherAssessmentListItem;
  progress: AssessmentProgress;
  group: AssessmentGroup;
  /** YYYY-MM-DD the list sorts and filters by. */
  day: string;
}

export function progressByAssessment(
  rows: TeacherAssessmentAssignmentRow[],
): Map<string, AssessmentProgress> {
  const map = new Map<string, AssessmentProgress>();
  for (const row of rows) {
    const entry = map.get(row.assessment_id) ?? { count: 0, toMark: 0, marked: 0, overdue: 0, late: 0 };
    entry.count += 1;
    if (row.status === "marked") entry.marked += 1;
    if (row.status === "taken") entry.toMark += 1;
    // Before a student takes it, isLate means "past due now"; after, it
    // means "was taken late" (lib/assessment-status.ts).
    if (row.isLate && row.status === "registered") entry.overdue += 1;
    if (row.isLate && row.status !== "registered") entry.late += 1;
    map.set(row.assessment_id, entry);
  }
  return map;
}

/**
 * The day an assessment belongs to: a mock exam's date, a short test's
 * deadline (Athens), or - an open short test - the day it was made.
 */
export function assessmentDay(assessment: {
  kind: AssessmentKind;
  scheduled_date: string | null;
  deadline_at: string | null;
  created_at: string;
}): string {
  if (assessment.kind === "mock_exam" && assessment.scheduled_date) return assessment.scheduled_date;
  if (assessment.kind === "short_assessment" && assessment.deadline_at) {
    return athensDateAndTime(assessment.deadline_at).date;
  }
  return athensDateAndTime(assessment.created_at).date;
}

/** The first day of the school year `today` is in: 1 September (or the year before, before September). */
export function schoolYearStart(today: string, startMonth = SCHOOL_YEAR_START_MONTH): string {
  const [year, month] = today.split("-").map(Number);
  const startYear = month >= startMonth ? year : year - 1;
  return `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
}

export function assessmentGroup(progress: AssessmentProgress): AssessmentGroup {
  if (progress.count === 0) return "attention";
  if (progress.marked === progress.count) return "done";
  if (progress.overdue > 0 || progress.toMark > 0) return "attention";
  return "upcoming";
}

export interface AssessmentFilters {
  /** "" = any. */
  grade: string;
  classId: string;
  kind: "" | AssessmentKind;
  /** Title, accent- and case-insensitive. */
  search: string;
  includeEarlierYears: boolean;
}

export const NO_FILTERS: AssessmentFilters = {
  grade: "",
  classId: "",
  kind: "",
  search: "",
  includeEarlierYears: false,
};

export interface AssessmentGroups {
  attention: AssessmentListRow[];
  upcoming: AssessmentListRow[];
  done: AssessmentListRow[];
  /** Assessments left out for being from an earlier school year (with the other filters on). */
  earlierYears: number;
}

export function groupAssessments(
  assessments: TeacherAssessmentListItem[],
  assignments: TeacherAssessmentAssignmentRow[],
  filters: AssessmentFilters,
  today: string,
): AssessmentGroups {
  const progress = progressByAssessment(assignments);
  const yearStart = schoolYearStart(today);
  const key = searchKey(filters.search.trim());
  const groups: AssessmentGroups = { attention: [], upcoming: [], done: [], earlierYears: 0 };

  for (const assessment of assessments) {
    if (filters.grade && assessment.grade !== filters.grade) continue;
    if (filters.classId && assessment.class_id !== filters.classId) continue;
    if (filters.kind && assessment.kind !== filters.kind) continue;
    if (key && !searchKey(assessment.title).includes(key)) continue;

    const row: AssessmentListRow = {
      assessment,
      progress: progress.get(assessment.id) ?? { count: 0, toMark: 0, marked: 0, overdue: 0, late: 0 },
      group: "upcoming",
      day: assessmentDay(assessment),
    };
    row.group = assessmentGroup(row.progress);
    // Something still to do stays in view whatever its year.
    if (row.day < yearStart && row.group === "done" && !filters.includeEarlierYears) {
      groups.earlierYears += 1;
      continue;
    }
    groups[row.group].push(row);
  }

  const byDay = (a: AssessmentListRow, b: AssessmentListRow) =>
    a.day === b.day ? a.assessment.title.localeCompare(b.assessment.title, "el") : a.day < b.day ? -1 : 1;
  groups.attention.sort(byDay);
  groups.upcoming.sort(byDay);
  // The most recent first.
  groups.done.sort((a, b) => byDay(b, a));
  return groups;
}
