// Mock exams on the calendar (console Calendar tab and the phone's Today):
// each sitting as a block at its time, and a lesson at the same time beside
// it rather than above or below. Pure - unit-tested in
// tests/calendar-exams.test.ts.
//
// Exams that overlap each other (several tests in one slot) share one
// block marking the exam time; the teacher holds them together, often in
// another room, so a lesson overlapping a block is not a warning, just
// placed side by side. Short tests have deadlines, not sittings, and stay
// off the calendar.

export interface ExamSitting {
  assessmentId: string;
  title: string;
  /** YYYY-MM-DD. */
  date: string;
  /** "HH:MM", or null for no time set. */
  startTime: string | null;
  durationMinutes: number;
  /** The class it was given to, if any (a snapshot name). */
  className: string | null;
  /** Students sitting it at this date and time. */
  studentCount: number;
}

/** One block on the calendar: one or more exams sharing a time. */
export interface ExamBlock {
  date: string;
  /** null: no time set - shown at the top of the day. */
  start: string | null;
  end: string | null;
  exams: ExamSitting[];
}

type AssessmentInput = {
  id: string;
  kind: "mock_exam" | "short_assessment";
  title: string;
  duration_minutes: number;
  scheduled_time: string | null;
  class_name: string | null;
};

type AssignmentInput = {
  assessment_id: string;
  kind: "mock_exam" | "short_assessment";
  effective_scheduled_date: string | null;
  effective_scheduled_time: string | null;
};

/**
 * Sittings from the per-student rows: students on the same exam, day and
 * time sit together; one moved to another day (or time) makes a sitting
 * of their own.
 */
export function examSittings(
  assessments: AssessmentInput[],
  assignments: AssignmentInput[],
): ExamSitting[] {
  const byId = new Map(assessments.map((assessment) => [assessment.id, assessment]));
  const sittings = new Map<string, ExamSitting>();
  for (const row of assignments) {
    if (row.kind !== "mock_exam" || !row.effective_scheduled_date) continue;
    const assessment = byId.get(row.assessment_id);
    if (!assessment) continue;
    const startTime = row.effective_scheduled_time ?? assessment.scheduled_time ?? null;
    const key = `${row.assessment_id}|${row.effective_scheduled_date}|${startTime ?? ""}`;
    const sitting = sittings.get(key) ?? {
      assessmentId: row.assessment_id,
      title: assessment.title,
      date: row.effective_scheduled_date,
      startTime,
      durationMinutes: assessment.duration_minutes,
      className: assessment.class_name,
      studentCount: 0,
    };
    sitting.studentCount += 1;
    sittings.set(key, sitting);
  }
  return [...sittings.values()];
}

export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function fromMinutes(total: number): string {
  const clamped = Math.min(total, 24 * 60 - 1);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/**
 * One day's blocks: sittings whose times overlap merge into one block
 * spanning them all; those with no time share one block at the top.
 */
export function examBlocksForDay(sittings: ExamSitting[], date: string): ExamBlock[] {
  const day = sittings.filter((sitting) => sitting.date === date);
  const blocks: ExamBlock[] = [];

  const untimed = day.filter((sitting) => sitting.startTime === null);
  if (untimed.length > 0) blocks.push({ date, start: null, end: null, exams: sortExams(untimed) });

  const timed = day
    .filter((sitting) => sitting.startTime !== null)
    .map((sitting) => {
      const start = toMinutes(sitting.startTime!);
      return { sitting, start, end: start + Math.max(sitting.durationMinutes, 1) };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let current: { start: number; end: number; exams: ExamSitting[] } | null = null;
  for (const item of timed) {
    if (current && item.start < current.end) {
      current.end = Math.max(current.end, item.end);
      current.exams.push(item.sitting);
    } else {
      if (current) blocks.push(toBlock(date, current));
      current = { start: item.start, end: item.end, exams: [item.sitting] };
    }
  }
  if (current) blocks.push(toBlock(date, current));
  return blocks;
}

function toBlock(date: string, span: { start: number; end: number; exams: ExamSitting[] }): ExamBlock {
  return { date, start: fromMinutes(span.start), end: fromMinutes(span.end), exams: sortExams(span.exams) };
}

function sortExams(exams: ExamSitting[]): ExamSitting[] {
  return [...exams].sort((a, b) => a.title.localeCompare(b.title, "el"));
}

/** A row of the day's list: a lesson (or anything else) on its own, a block on its own, or both side by side. */
export type DayRow<T> =
  | { type: "item"; item: T }
  | { type: "exam"; exam: ExamBlock }
  | { type: "side-by-side"; items: T[]; exam: ExamBlock };

/**
 * Lays a day's items (already in time order) out with its exam blocks:
 * every item whose time overlaps a block goes beside it, in one row
 * placed where the earlier of the two starts; a block with nothing
 * beside it stands in time order. Items with no window (all-day ones,
 * holiday breaks) are never paired. The block with no time comes first.
 */
export function layoutDay<T>(
  items: T[],
  windowOf: (item: T) => { start: string; end: string } | null,
  blocks: ExamBlock[],
): DayRow<T>[] {
  const paired = new Set<number>();
  type Anchor = { start: number; order: number; row: DayRow<T> };
  const anchors: Anchor[] = [];

  blocks.forEach((block, blockIndex) => {
    if (block.start === null || block.end === null) {
      anchors.push({ start: -1, order: -1000 + blockIndex, row: { type: "exam", exam: block } });
      return;
    }
    const [blockStart, blockEnd] = [toMinutes(block.start), toMinutes(block.end)];
    const beside: number[] = [];
    items.forEach((item, index) => {
      if (paired.has(index)) return;
      const window = windowOf(item);
      if (!window) return;
      if (toMinutes(window.start) < blockEnd && blockStart < toMinutes(window.end)) beside.push(index);
    });
    beside.forEach((index) => paired.add(index));
    const starts = [blockStart, ...beside.map((index) => toMinutes(windowOf(items[index])!.start))];
    anchors.push({
      start: Math.min(...starts),
      // Before a lone item starting at the same minute, so the pair keeps
      // its place in the day.
      order: beside.length > 0 ? beside[0] - 0.5 : items.length + blockIndex,
      row:
        beside.length > 0
          ? { type: "side-by-side", items: beside.map((index) => items[index]), exam: block }
          : { type: "exam", exam: block },
    });
  });

  items.forEach((item, index) => {
    if (paired.has(index)) return;
    const window = windowOf(item);
    // An item with no time (all day, a holiday) keeps its place at the top.
    anchors.push({ start: window ? toMinutes(window.start) : -1, order: index, row: { type: "item", item } });
  });

  return anchors.sort((a, b) => a.start - b.start || a.order - b.order).map((anchor) => anchor.row);
}
