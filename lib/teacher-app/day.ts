import {
  fromIsoDate,
  projectOccurrences,
  weekdayLabelFromDate,
  toIsoDate,
  type Occurrence,
  type ProjectionClass,
  type ProjectionEvent,
  type ProjectionSlot,
} from "@/lib/calendar-projection";
import { lessonTimeLabel, recurringLessonWindow, timeToMinutes } from "@/lib/schedule-grid";
import {
  collapseSchoolBreaksByDay,
  type CancellationReason,
  type SchoolBreakItem,
} from "@/lib/school-closures";

/**
 * Pure building blocks for the phone companion's "Today" screen: which
 * lessons a day has, and the lesson days either side of it. Same projection
 * and the same filter as the Calendar tab's per-lesson attendance
 * (components/teacher-calendar.tsx `attendanceLessons`): only recurring
 * lessons and extra sessions with a class take attendance, a class meeting
 * twice the same day is one lesson (it shares one attendance row per
 * student/date), and a cancelled lesson is listed but can't be opened.
 */

export type DayLesson = {
  classId: string;
  className: string;
  timeLabel: string | null;
  startTime: string | null;
  isTwoHour: boolean;
  kind: "recurring" | "extra_session" | "cancelled";
  /** Why a cancelled lesson was cancelled, when the teacher said. */
  cancellationReason: CancellationReason | null;
  /** The real teaching window, minutes since midnight (null without a start time). */
  startMinutes: number | null;
  endMinutes: number | null;
  rosterSize: number;
  marked: number;
  absent: number;
};

export type DayAttendanceRow = { class_id: string; student_id: string; status: string };

export type DayProjection = {
  slots: ProjectionSlot[];
  classes: ProjectionClass[];
  events: ProjectionEvent[];
};

export function addDays(date: string, days: number): string {
  const next = fromIsoDate(date);
  next.setDate(next.getDate() + days);
  return toIsoDate(next);
}

/**
 * An occurrence's real teaching window in minutes. A customised slot already
 * carries its real start/end; a plain template slot only has its grid anchor,
 * so the window comes from recurringLessonWindow() (the 15-minute break
 * rule); an event uses its own times, or 1 h / 2 h when it has no end.
 */
export function occurrenceWindow(
  occurrence: Occurrence,
): { start: number; end: number } | null {
  if (!occurrence.startTime) return null;
  if (occurrence.endTime) {
    return {
      start: timeToMinutes(occurrence.startTime),
      end: timeToMinutes(occurrence.endTime),
    };
  }
  if (occurrence.slotTime && occurrence.eventId === null) {
    const window = recurringLessonWindow(
      weekdayLabelFromDate(fromIsoDate(occurrence.date)),
      occurrence.slotTime,
      occurrence.isTwoHour,
    );
    return { start: timeToMinutes(window.start), end: timeToMinutes(window.end) };
  }
  const start = timeToMinutes(occurrence.startTime);
  return { start, end: start + (occurrence.isTwoHour ? 120 : 60) };
}

function isAttendanceLesson(occurrence: Occurrence): boolean {
  return (
    (occurrence.kind === "recurring" || occurrence.kind === "extra_session") &&
    occurrence.classId !== null
  );
}

export function buildDayLessons({
  date,
  projection,
  rosterByClass,
  attendance,
}: {
  date: string;
  projection: DayProjection;
  /** Active student ids per class. */
  rosterByClass: Map<string, Set<string>>;
  attendance: DayAttendanceRow[];
}): DayLesson[] {
  const occurrences = projectOccurrences({
    from: date,
    to: date,
    ...projection,
    includeBlocks: false,
  });

  const lessons = new Map<string, DayLesson>();
  for (const occurrence of occurrences) {
    if (!occurrence.classId) continue;
    const isCancelled = occurrence.kind === "cancelled";
    if (!isCancelled && !isAttendanceLesson(occurrence)) continue;

    const existing = lessons.get(occurrence.classId);
    // A real lesson wins over a cancelled one the same day (e.g. the 16:00
    // was cancelled but the 18:00 still happens).
    if (existing && (existing.kind !== "cancelled" || isCancelled)) continue;

    const window = occurrenceWindow(occurrence);
    const roster = rosterByClass.get(occurrence.classId) ?? new Set<string>();
    const marks = attendance.filter(
      (row) => row.class_id === occurrence.classId && roster.has(row.student_id),
    );
    lessons.set(occurrence.classId, {
      classId: occurrence.classId,
      className: occurrence.className ?? "",
      timeLabel: occurrence.startTime
        ? lessonTimeLabel(occurrence.startTime, occurrence.isTwoHour, occurrence.endTime)
        : null,
      startTime: occurrence.startTime,
      isTwoHour: occurrence.isTwoHour,
      startMinutes: window?.start ?? null,
      endMinutes: window?.end ?? null,
      kind: isCancelled ? "cancelled" : (occurrence.kind as "recurring" | "extra_session"),
      cancellationReason: isCancelled ? occurrence.cancellationReason : null,
      rosterSize: roster.size,
      marked: marks.length,
      absent: marks.filter((row) => row.status === "absent").length,
    });
  }

  return [...lessons.values()].sort((a, b) =>
    (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99"),
  );
}

/**
 * The day's one-off and trial lessons and personal blocks - they have no
 * class, so they aren't in buildDayLessons(). A one-off opens its own
 * one-student attendance screen; a trial gets an inline came / no-show
 * mark; a block (the teacher's own time) is shown for reference.
 */
export type DayEventLesson = {
  eventId: string;
  kind: "ad_hoc_lesson" | "trial_lesson" | "block";
  /** The student (one-off), the trial contact, or the block's title. */
  name: string;
  timeLabel: string | null;
  startTime: string | null;
  /** One-off only: the student's mark, "" when not taken yet. */
  status: string;
  /** Trial only. */
  trialOutcome: "came" | "no_show" | null;
};

export function buildDayEventLessons({
  date,
  projection,
  statusByEventId,
}: {
  date: string;
  projection: DayProjection;
  /** One-off lessons' marks that day, by calendar event id. */
  statusByEventId: Map<string, string>;
}): DayEventLesson[] {
  const outcomes = new Map(
    projection.events.map((event) => [event.id, event.trial_outcome ?? null]),
  );
  return projectOccurrences({ from: date, to: date, ...projection, includeBlocks: true })
    .filter(
      (occurrence) =>
        occurrence.eventId !== null &&
        (occurrence.kind === "ad_hoc_lesson" ||
          occurrence.kind === "trial_lesson" ||
          occurrence.kind === "block"),
    )
    .map((occurrence) => ({
      eventId: occurrence.eventId!,
      kind: occurrence.kind as DayEventLesson["kind"],
      name:
        (occurrence.kind === "ad_hoc_lesson"
          ? occurrence.studentName
          : occurrence.kind === "trial_lesson"
            ? occurrence.contactName
            : occurrence.title) ?? "",
      timeLabel: occurrence.startTime
        ? lessonTimeLabel(occurrence.startTime, occurrence.isTwoHour, occurrence.endTime)
        : null,
      startTime: occurrence.startTime,
      status: statusByEventId.get(occurrence.eventId!) ?? "",
      trialOutcome: occurrence.kind === "trial_lesson" ? (outcomes.get(occurrence.eventId!) ?? null) : null,
    }));
}

/**
 * The day's holidays (a break or a public holiday), each as one entry in
 * place of the lessons it cancelled - the same grouping as the console's
 * Calendar tab (collapseSchoolBreaksByDay). The Today screen shows these
 * instead of those cancelled lessons.
 */
export function buildDayHolidays({
  date,
  projection,
}: {
  date: string;
  projection: DayProjection;
}): SchoolBreakItem[] {
  return collapseSchoolBreaksByDay(
    projectOccurrences({ from: date, to: date, ...projection, includeBlocks: false }),
  ).filter((item): item is SchoolBreakItem => item.type === "break");
}

/**
 * The lesson happening now, if any: from 10 minutes before it starts to 15
 * minutes after it ends (time to open the app and to finish marking), the
 * earliest-starting one when two overlap. Cancelled lessons never count.
 */
export function lessonInProgress(lessons: DayLesson[], minutesNow: number): DayLesson | null {
  return (
    lessons
      .filter(
        (lesson) =>
          lesson.kind !== "cancelled" &&
          lesson.startMinutes !== null &&
          lesson.endMinutes !== null &&
          minutesNow >= lesson.startMinutes - 10 &&
          minutesNow <= lesson.endMinutes + 15,
      )
      .sort((a, b) => (a.startMinutes ?? 0) - (b.startMinutes ?? 0))[0] ?? null
  );
}

/**
 * The nearest days before and after `date` (within `windowDays`) that have a
 * lesson taking attendance - a class lesson, a one-off or a trial - for the
 * date strip's ‹ › buttons.
 */
export function neighbouringLessonDays({
  date,
  projection,
  windowDays = 21,
}: {
  date: string;
  projection: DayProjection;
  windowDays?: number;
}): { previous: string | null; next: string | null } {
  const days = new Set(
    projectOccurrences({
      from: addDays(date, -windowDays),
      to: addDays(date, windowDays),
      ...projection,
      includeBlocks: false,
    })
      .filter(
        (occurrence) =>
          isAttendanceLesson(occurrence) ||
          occurrence.kind === "ad_hoc_lesson" ||
          occurrence.kind === "trial_lesson",
      )
      .map((occurrence) => occurrence.date),
  );
  const sorted = [...days].sort();
  return {
    previous: sorted.filter((day) => day < date).at(-1) ?? null,
    next: sorted.find((day) => day > date) ?? null,
  };
}

/** Whether `date` has a lesson for `classId` that takes attendance. */
export function classHasLessonOn(
  classId: string,
  date: string,
  projection: DayProjection,
): Occurrence | null {
  return (
    projectOccurrences({ from: date, to: date, ...projection, includeBlocks: false }).find(
      (occurrence) => occurrence.classId === classId && isAttendanceLesson(occurrence),
    ) ?? null
  );
}

/**
 * The class's next `count` lesson days strictly after `date`, within
 * `windowDays` (a class meeting twice the same day counts once).
 */
export function nextLessonDays(
  classId: string,
  date: string,
  projection: DayProjection,
  count = 3,
  windowDays = 60,
): string[] {
  const days: string[] = [];
  for (const occurrence of projectOccurrences({
    from: addDays(date, 1),
    to: addDays(date, windowDays),
    ...projection,
    includeBlocks: false,
  })) {
    if (occurrence.classId !== classId || !isAttendanceLesson(occurrence)) continue;
    if (days.at(-1) !== occurrence.date) days.push(occurrence.date);
    if (days.length === count) break;
  }
  return days;
}
