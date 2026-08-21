import { toIsoDate, weekdayLabelFromDate } from "@/lib/calendar-projection";
import type { CalendarEvent } from "@/lib/types/database";

// Whether a given date should be pickable in the Attendance tab's date
// picker for one class. Separate module from calendar-projection.ts:
// different consumer (a boolean gate, not a list of occurrences to render),
// different shape, and it earns its own dedicated test file matching this
// repo's convention for pure logic (see lib/quiz-markdown.ts).

export interface AttendanceDateSets {
  /** "Mon" | ... - the weekdays this class already meets on, per the template. */
  scheduleWeekdays: Set<string>;
  /** yyyy-MM-dd dates where an extra_session exists for this class. */
  extraSessionDates: Set<string>;
  /** yyyy-MM-dd dates where every template occurrence for this class is cancelled. */
  cancelledDates: Set<string>;
  /** yyyy-MM-dd dates where an attendance_records row already exists for this class. */
  datesWithAttendance: Set<string>;
}

export function buildAttendanceDateSets(args: {
  classId: string;
  slots: Array<{ classId: string; day: string; time: string }>;
  events: Array<
    Pick<CalendarEvent, "event_type" | "class_id" | "event_date" | "start_time">
  >;
  attendance: Array<{ classId: string | null; attendanceDate: string }>;
}): AttendanceDateSets {
  const { classId } = args;

  const scheduleWeekdays = new Set<string>();
  const templateTimesByWeekday = new Map<string, Set<string>>();
  for (const slot of args.slots) {
    if (slot.classId !== classId) continue;
    scheduleWeekdays.add(slot.day);
    const times = templateTimesByWeekday.get(slot.day) ?? new Set<string>();
    times.add(slot.time);
    templateTimesByWeekday.set(slot.day, times);
  }

  const extraSessionDates = new Set<string>();
  // date -> cancelled start_times for that date (null key means whole-day)
  const cancellationsByDate = new Map<string, Set<string | null>>();
  for (const event of args.events) {
    if (event.class_id !== classId) continue;

    if (event.event_type === "extra_session") {
      extraSessionDates.add(event.event_date);
    }

    if (event.event_type === "cancellation") {
      const set = cancellationsByDate.get(event.event_date) ?? new Set();
      set.add(event.start_time);
      cancellationsByDate.set(event.event_date, set);
    }
  }

  // A date counts as fully cancelled only when every template slot-time for
  // that class/weekday is covered - a class meeting twice on the same
  // weekday must not have attendance blocked for its OTHER session just
  // because one of the two was cancelled.
  const cancelledDates = new Set<string>();
  for (const [date, cancelledTimes] of cancellationsByDate) {
    if (cancelledTimes.has(null)) {
      cancelledDates.add(date);
      continue;
    }
    const weekday = weekdayLabelFromDate(new Date(`${date}T00:00:00`));
    const templateTimes = templateTimesByWeekday.get(weekday);
    if (
      templateTimes &&
      templateTimes.size > 0 &&
      [...templateTimes].every((time) => cancelledTimes.has(time))
    ) {
      cancelledDates.add(date);
    }
  }

  const datesWithAttendance = new Set<string>();
  for (const record of args.attendance) {
    if (record.classId !== classId) continue;
    datesWithAttendance.add(record.attendanceDate);
  }

  return { scheduleWeekdays, extraSessionDates, cancelledDates, datesWithAttendance };
}

/**
 * Priority order is load-bearing:
 *   1. already has attendance -> always editable (deleting a calendar event
 *      later must never orphan taken attendance from view)
 *   2. cancelled              -> blocked
 *   3. extra session          -> allowed
 *   4. weekday template       -> existing behavior, unchanged fallback
 */
export function isDateEnabledForAttendance(
  date: Date,
  sets: AttendanceDateSets,
): boolean {
  const iso = toIsoDate(date);
  if (sets.datesWithAttendance.has(iso)) return true;
  if (sets.cancelledDates.has(iso)) return false;
  if (sets.extraSessionDates.has(iso)) return true;
  return sets.scheduleWeekdays.has(weekdayLabelFromDate(date));
}

export function findNextEnabledDate(start: Date, sets: AttendanceDateSets): Date {
  const hasAnything =
    sets.scheduleWeekdays.size > 0 ||
    sets.extraSessionDates.size > 0 ||
    sets.datesWithAttendance.size > 0;
  if (!hasAnything) {
    return start;
  }
  const date = new Date(start.getTime());
  for (let i = 0; i < 14; i += 1) {
    if (isDateEnabledForAttendance(date, sets)) {
      return date;
    }
    date.setDate(date.getDate() + 1);
  }
  return start;
}
