import { formatShortDateEl } from "@/lib/push/athens-time";
import { formatClosureRangeEl } from "@/lib/school-closures";
import type { NotificationEvent } from "@/lib/push/messages";
import type { NotifyInput } from "@/lib/push/notify";

/**
 * Which "lesson changes" notice a calendar edit means for students, if any.
 * Pure, so the rules are easy to test:
 *   - only cancellations, extra sessions and one-off lessons concern
 *     students (trial lessons and blocks are the teacher's own);
 *   - only dates from today on - tidying up the past is not news.
 */
export type CalendarRow = {
  id?: string;
  event_type: string;
  event_date: string;
  start_time: string | null;
  class_id: string | null;
  class_name: string | null;
  student_id: string | null;
};

type Notice = Pick<NotifyInput, "event" | "to" | "values" | "classId" | "tag">;

const ONE_OFF_LABEL = "ιδιαίτερο μάθημα";

function target(row: CalendarRow): Pick<NotifyInput, "to" | "classId"> | null {
  if ((row.event_type === "cancellation" || row.event_type === "extra_session") && row.class_id) {
    return { to: { kind: "class_students", classId: row.class_id }, classId: row.class_id };
  }
  if (row.event_type === "ad_hoc_lesson" && row.student_id) {
    return { to: { kind: "students", studentIds: [row.student_id] }, classId: null };
  }
  return null;
}

function className(row: CalendarRow) {
  return row.event_type === "ad_hoc_lesson" ? ONE_OFF_LABEL : row.class_name ?? "";
}

function notice(row: CalendarRow, event: NotificationEvent): Notice | null {
  const who = target(row);
  if (!who) return null;
  return {
    event,
    ...who,
    values: {
      class: className(row),
      date: formatShortDateEl(row.event_date),
      time: row.start_time,
    },
    tag: `lesson-${row.class_id ?? row.student_id}-${row.event_date}`,
  };
}

/** A calendar event was added. */
export function noticeForCreated(row: CalendarRow, today: string): Notice | null {
  if (row.event_date < today) return null;
  return notice(row, row.event_type === "cancellation" ? "lesson_cancelled" : "lesson_extra");
}

/** A calendar event was deleted: a removed cancellation means the lesson is back on. */
export function noticeForDeleted(row: CalendarRow, today: string): Notice | null {
  if (row.event_date < today) return null;
  return notice(row, row.event_type === "cancellation" ? "lesson_restored" : "lesson_cancelled");
}

/** A calendar event's date or time was edited. */
export function noticeForUpdated(
  before: CalendarRow,
  after: CalendarRow,
  today: string,
): Notice | null {
  const moved =
    before.event_date !== after.event_date || before.start_time !== after.start_time;
  if (!moved || (before.event_date < today && after.event_date < today)) return null;
  if (after.event_type === "cancellation") {
    return after.event_date >= today ? notice(after, "lesson_cancelled") : null;
  }
  return noticeForMove(before, after);
}

/** One lesson moved to another date/time - one notice, not cancel + extra. */
export function noticeForMove(from: CalendarRow, to: CalendarRow): Notice | null {
  const base = notice(to, "lesson_moved");
  if (!base) return null;
  return {
    ...base,
    values: {
      class: className(to),
      date: formatShortDateEl(from.event_date),
      time: from.start_time,
      new_date: formatShortDateEl(to.event_date),
      new_time: to.start_time,
    },
  };
}

/**
 * A school closure was added (or undone): one notice per class - a two-week
 * break is one message, not one per lesson. It names the dates the closure
 * was declared for when the rows carry them (older closures don't), else
 * the span of that class's own cancelled lessons; either way from today on.
 * A class with only past lessons gets nothing.
 */
export function noticesForClosure(
  rows: Array<
    Pick<CalendarRow, "event_date" | "class_id" | "class_name"> & {
      closure_from?: string | null;
      closure_to?: string | null;
    }
  >,
  change: { kind: "closed"; reasonLabel: string } | { kind: "reopened" },
  closureId: string,
  today: string,
): Notice[] {
  const byClass = new Map<string, { name: string; from: string; to: string }>();
  for (const row of rows) {
    if (!row.class_id || row.event_date < today) continue;
    // An official range already under way is named from today, not its start.
    const from =
      row.closure_from && row.closure_to
        ? row.closure_from > today
          ? row.closure_from
          : today
        : row.event_date;
    const to = row.closure_from && row.closure_to ? row.closure_to : row.event_date;
    const span = byClass.get(row.class_id);
    if (!span) {
      byClass.set(row.class_id, { name: row.class_name ?? "", from, to });
      continue;
    }
    if (from < span.from) span.from = from;
    if (to > span.to) span.to = to;
  }

  return [...byClass].map(([classId, span]) => ({
    event: change.kind === "closed" ? "lessons_closed" : "lessons_reopened",
    to: { kind: "class_students", classId },
    classId,
    values: {
      class: span.name,
      date: formatClosureRangeEl(span.from, span.to),
      reason: change.kind === "closed" ? change.reasonLabel : null,
    },
    tag: `closure-${closureId}-${classId}`,
  }));
}
