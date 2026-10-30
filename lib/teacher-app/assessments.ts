import { athensDateAndTime, addDaysToDate } from "@/lib/push/athens-time";
import type { AssessmentAssignmentStatus, AssessmentKind } from "@/lib/types/database";

// The phone's Tests tab (app/teacher-app/assessments): which assessments to
// show where. Pure - the page loads the rows, this sorts them. Works per
// student, since a student's date can be moved on its own
// (effective_scheduled_date / effective_deadline_at): one assessment can sit
// in "Not taken yet" for one student and "Upcoming" for another.

/** How far ahead "Upcoming" looks. */
export const UPCOMING_DAYS = 14;

export interface TestsAssessment {
  id: string;
  kind: AssessmentKind;
  title: string;
  class_name: string | null;
  max_score: number;
}

export interface TestsAssignment {
  assessment_id: string;
  status: AssessmentAssignmentStatus;
  effective_scheduled_date: string | null;
  effective_scheduled_time: string | null;
  effective_deadline_at: string | null;
}

/** When one student sits (mock exam) or must hand in (short test), in Athens time. */
export interface TestsWhen {
  date: string | null;
  time: string | null;
}

export function assignmentWhen(kind: AssessmentKind, row: TestsAssignment): TestsWhen {
  if (kind === "mock_exam") {
    return { date: row.effective_scheduled_date, time: row.effective_scheduled_time };
  }
  return row.effective_deadline_at
    ? athensDateAndTime(row.effective_deadline_at)
    : { date: null, time: null };
}

/**
 * Should this student have taken it by now? A mock exam once its day is
 * over (same as lib/assessment-status.ts - the time is the start, not a
 * deadline); a short test once its deadline has passed; an open short test
 * never.
 */
export function isOverdue(
  kind: AssessmentKind,
  row: TestsAssignment,
  today: string,
  now: Date,
): boolean {
  if (row.status !== "registered") return false;
  if (kind === "mock_exam") {
    return row.effective_scheduled_date !== null && row.effective_scheduled_date < today;
  }
  return row.effective_deadline_at !== null && new Date(row.effective_deadline_at) < now;
}

export interface TestsItem {
  assessment: TestsAssessment;
  /** Students on it. */
  total: number;
  /** Taken or marked. */
  taken: number;
  marked: number;
  /** The soonest still-to-take date in this group (null: open short test). */
  when: TestsWhen;
  /** Students this group is about (still to take, or still to mark). */
  count: number;
}

export interface TestsGroups {
  overdue: TestsItem[];
  today: TestsItem[];
  upcoming: TestsItem[];
  /** Nobody left to take it, some scores still missing. */
  awaitingMarks: TestsItem[];
}

function earlier(a: TestsWhen, b: TestsWhen): TestsWhen {
  if (a.date === null) return b;
  if (b.date === null) return a;
  if (a.date !== b.date) return a.date < b.date ? a : b;
  return (a.time ?? "") <= (b.time ?? "") ? a : b;
}

function compareWhen(a: TestsItem, b: TestsItem): number {
  // Open (no date) last.
  if (a.when.date !== b.when.date) {
    if (a.when.date === null) return 1;
    if (b.when.date === null) return -1;
    return a.when.date < b.when.date ? -1 : 1;
  }
  const at = a.when.time ?? "";
  const bt = b.when.time ?? "";
  if (at !== bt) return at < bt ? -1 : 1;
  return a.assessment.title.localeCompare(b.assessment.title, "el");
}

export function groupTests(
  assessments: TestsAssessment[],
  assignments: TestsAssignment[],
  today: string,
  now: Date = new Date(),
): TestsGroups {
  const rowsByAssessment = new Map<string, TestsAssignment[]>();
  for (const row of assignments) {
    const list = rowsByAssessment.get(row.assessment_id) ?? [];
    list.push(row);
    rowsByAssessment.set(row.assessment_id, list);
  }
  const horizon = addDaysToDate(today, UPCOMING_DAYS);
  const groups: TestsGroups = { overdue: [], today: [], upcoming: [], awaitingMarks: [] };

  for (const assessment of assessments) {
    const rows = rowsByAssessment.get(assessment.id) ?? [];
    if (rows.length === 0) continue;
    const taken = rows.filter((row) => row.status !== "registered").length;
    const marked = rows.filter((row) => row.status === "marked").length;
    const base = { assessment, total: rows.length, taken, marked };

    const buckets: Record<"overdue" | "today" | "upcoming", { when: TestsWhen; count: number } | null> = {
      overdue: null,
      today: null,
      upcoming: null,
    };
    for (const row of rows) {
      if (row.status !== "registered") continue;
      const when = assignmentWhen(assessment.kind, row);
      const key = isOverdue(assessment.kind, row, today, now)
        ? "overdue"
        : when.date === today
          ? "today"
          : when.date === null || when.date <= horizon
            ? "upcoming"
            : null;
      if (!key) continue;
      const bucket = buckets[key];
      buckets[key] = bucket
        ? { when: earlier(bucket.when, when), count: bucket.count + 1 }
        : { when, count: 1 };
    }
    for (const key of ["overdue", "today", "upcoming"] as const) {
      const bucket = buckets[key];
      if (bucket) groups[key].push({ ...base, ...bucket });
    }

    if (taken === rows.length && marked < taken) {
      const when = rows
        .map((row) => assignmentWhen(assessment.kind, row))
        .reduce((a, b) => (earlier(a, b) === a ? b : a));
      groups.awaitingMarks.push({ ...base, when, count: taken - marked });
    }
  }

  groups.overdue.sort(compareWhen);
  groups.today.sort(compareWhen);
  groups.upcoming.sort(compareWhen);
  // Most recent first: the paper pile on top.
  groups.awaitingMarks.sort((a, b) => compareWhen(b, a));
  return groups;
}

/** The tab badge: students who should have taken a test by now and haven't. */
export function overdueCount(
  assessments: Pick<TestsAssessment, "id" | "kind">[],
  assignments: TestsAssignment[],
  today: string,
  now: Date = new Date(),
): number {
  const kinds = new Map(assessments.map((assessment) => [assessment.id, assessment.kind]));
  return assignments.filter((row) => {
    const kind = kinds.get(row.assessment_id);
    return kind !== undefined && isOverdue(kind, row, today, now);
  }).length;
}
