import {
  fromIsoDate,
  projectOccurrences,
  toIsoDate,
  type Occurrence,
  type ProjectionClass,
  type ProjectionEvent,
  type ProjectionSlot,
} from "@/lib/calendar-projection";
import { lessonTimeLabel } from "@/lib/schedule-grid";

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
      kind: isCancelled ? "cancelled" : (occurrence.kind as "recurring" | "extra_session"),
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
 * The nearest days before and after `date` (within `windowDays`) that have a
 * lesson taking attendance, for the date strip's ‹ › buttons.
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
      .filter(isAttendanceLesson)
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

/** The class's first lesson day strictly after `date`, within `windowDays`. */
export function nextLessonDay(
  classId: string,
  date: string,
  projection: DayProjection,
  windowDays = 60,
): string | null {
  return (
    projectOccurrences({
      from: addDays(date, 1),
      to: addDays(date, windowDays),
      ...projection,
      includeBlocks: false,
    }).find((occurrence) => occurrence.classId === classId && isAttendanceLesson(occurrence))
      ?.date ?? null
  );
}
