import { describe, it, expect } from "vitest";
import {
  buildAttendanceDateSets,
  isDateEnabledForAttendance,
  findNextEnabledDate,
} from "@/lib/attendance-dates";
import { toIsoDate } from "@/lib/calendar-projection";

const CLASS_A = "class-a";
const CLASS_B = "class-b";

function date(iso: string) {
  return new Date(`${iso}T00:00:00`);
}

describe("buildAttendanceDateSets", () => {
  it("ignores events and slots belonging to another class", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [{ classId: CLASS_B, day: "Mon", time: "15:00" }],
      events: [
        {
          event_type: "extra_session",
          class_id: CLASS_B,
          event_date: "2026-09-03",
          start_time: "17:00",
        },
      ],
      attendance: [{ classId: CLASS_B, attendanceDate: "2026-09-01" }],
    });

    expect(sets.scheduleWeekdays.size).toBe(0);
    expect(sets.extraSessionDates.size).toBe(0);
    expect(sets.datesWithAttendance.size).toBe(0);
  });

  it("only counts a date as cancelled once every template slot-time that weekday is covered", () => {
    // 2026-09-07 is a Monday.
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [
        { classId: CLASS_A, day: "Mon", time: "14:30" },
        { classId: CLASS_A, day: "Mon", time: "18:00" },
      ],
      events: [
        {
          event_type: "cancellation",
          class_id: CLASS_A,
          event_date: "2026-09-07",
          start_time: "14:30",
        },
      ],
      attendance: [],
    });
    expect(sets.cancelledDates.has("2026-09-07")).toBe(false);
  });

  it("counts a date as cancelled once all that weekday's template times are covered", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [
        { classId: CLASS_A, day: "Mon", time: "14:30" },
        { classId: CLASS_A, day: "Mon", time: "18:00" },
      ],
      events: [
        {
          event_type: "cancellation",
          class_id: CLASS_A,
          event_date: "2026-09-07",
          start_time: "14:30",
        },
        {
          event_type: "cancellation",
          class_id: CLASS_A,
          event_date: "2026-09-07",
          start_time: "18:00",
        },
      ],
      attendance: [],
    });
    expect(sets.cancelledDates.has("2026-09-07")).toBe(true);
  });

  it("treats a whole-day cancellation (null start_time) as fully cancelled regardless of template", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [{ classId: CLASS_A, day: "Mon", time: "14:30" }],
      events: [
        {
          event_type: "cancellation",
          class_id: CLASS_A,
          event_date: "2026-09-07",
          start_time: null,
        },
      ],
      attendance: [],
    });
    expect(sets.cancelledDates.has("2026-09-07")).toBe(true);
  });

  it("flags a weekday as two-hour only when one of that class's slots that day is", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [
        { classId: CLASS_A, day: "Mon", time: "16:00", isTwoHour: true },
        { classId: CLASS_A, day: "Wed", time: "16:00", isTwoHour: false },
        { classId: CLASS_B, day: "Fri", time: "16:00", isTwoHour: true },
      ],
      events: [],
      attendance: [],
    });
    expect(sets.twoHourWeekdays.has("Mon")).toBe(true);
    expect(sets.twoHourWeekdays.has("Wed")).toBe(false);
    expect(sets.twoHourWeekdays.has("Fri")).toBe(false);
  });
});

describe("isDateEnabledForAttendance", () => {
  it("enables a weekday matching the recurring template", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [{ classId: CLASS_A, day: "Mon", time: "15:00" }],
      events: [],
      attendance: [],
    });
    expect(isDateEnabledForAttendance(date("2026-09-07"), sets)).toBe(true);
    expect(isDateEnabledForAttendance(date("2026-09-08"), sets)).toBe(false);
  });

  it("disables a cancelled date even if it matches the template", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [{ classId: CLASS_A, day: "Mon", time: "15:00" }],
      events: [
        {
          event_type: "cancellation",
          class_id: CLASS_A,
          event_date: "2026-09-07",
          start_time: null,
        },
      ],
      attendance: [],
    });
    expect(isDateEnabledForAttendance(date("2026-09-07"), sets)).toBe(false);
  });

  it("enables an extra-session date that doesn't match the template", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [],
      events: [
        {
          event_type: "extra_session",
          class_id: CLASS_A,
          event_date: "2026-09-03",
          start_time: "17:00",
        },
      ],
      attendance: [],
    });
    expect(isDateEnabledForAttendance(date("2026-09-03"), sets)).toBe(true);
    expect(isDateEnabledForAttendance(date("2026-09-04"), sets)).toBe(false);
  });

  it("always enables a date that already has an attendance record, even if cancelled", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [{ classId: CLASS_A, day: "Mon", time: "15:00" }],
      events: [
        {
          event_type: "cancellation",
          class_id: CLASS_A,
          event_date: "2026-09-07",
          start_time: null,
        },
      ],
      attendance: [{ classId: CLASS_A, attendanceDate: "2026-09-07" }],
    });
    expect(isDateEnabledForAttendance(date("2026-09-07"), sets)).toBe(true);
  });

  it("a class with zero template slots is enabled only on its extra-session date", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [],
      events: [
        {
          event_type: "extra_session",
          class_id: CLASS_A,
          event_date: "2026-09-10",
          start_time: "16:00",
        },
      ],
      attendance: [],
    });
    expect(isDateEnabledForAttendance(date("2026-09-10"), sets)).toBe(true);
    expect(isDateEnabledForAttendance(date("2026-09-11"), sets)).toBe(false);
  });
});

describe("findNextEnabledDate", () => {
  it("returns the start date unchanged when nothing is enabled at all", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [],
      events: [],
      attendance: [],
    });
    const start = date("2026-09-07");
    expect(findNextEnabledDate(start, sets).getTime()).toBe(start.getTime());
  });

  it("scans forward to the next matching weekday", () => {
    const sets = buildAttendanceDateSets({
      classId: CLASS_A,
      slots: [{ classId: CLASS_A, day: "Wed", time: "15:00" }],
      events: [],
      attendance: [],
    });
    // 2026-09-07 is a Monday; next Wednesday is 2026-09-09.
    const next = findNextEnabledDate(date("2026-09-07"), sets);
    expect(toIsoDate(next)).toBe("2026-09-09");
  });
});
