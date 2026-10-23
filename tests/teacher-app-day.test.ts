import { describe, expect, it } from "vitest";
import type { ProjectionEvent } from "@/lib/calendar-projection";
import {
  addDays,
  buildDayEventLessons,
  buildDayHolidays,
  buildDayLessons,
  lessonInProgress,
  neighbouringLessonDays,
  nextLessonDays,
  type DayProjection,
} from "@/lib/teacher-app/day";
import { teacherHomeFor } from "@/lib/teacher-app/view";

// 2026-09-07 is a Monday.
const MONDAY = "2026-09-07";

const CLASS_A = { id: "class-a", name: "Γ Γυμνασίου", archivedAt: null };
const CLASS_B = { id: "class-b", name: "Β Λυκείου", archivedAt: null };

function event(overrides: Partial<ProjectionEvent>): ProjectionEvent {
  return {
    id: "evt",
    event_type: "cancellation",
    event_date: MONDAY,
    start_time: null,
    end_time: null,
    class_id: CLASS_A.id,
    class_name: CLASS_A.name,
    student_id: null,
    student_name: null,
    contact_name: null,
    title: null,
    notes: null,
    ...overrides,
  };
}

function projection(overrides: Partial<DayProjection> = {}): DayProjection {
  return {
    classes: [CLASS_A, CLASS_B],
    slots: [
      { classId: CLASS_B.id, day: "Mon", time: "18:00" },
      { classId: CLASS_A.id, day: "Mon", time: "16:00" },
      { classId: CLASS_A.id, day: "Thu", time: "16:00" },
    ],
    events: [],
    ...overrides,
  };
}

const ROSTERS = new Map([
  [CLASS_A.id, new Set(["s1", "s2", "s3"])],
  [CLASS_B.id, new Set(["s4"])],
]);

describe("buildDayLessons", () => {
  it("lists the day's lessons in time order with attendance counts", () => {
    const lessons = buildDayLessons({
      date: MONDAY,
      projection: projection(),
      rosterByClass: ROSTERS,
      attendance: [
        { class_id: CLASS_A.id, student_id: "s1", status: "present" },
        { class_id: CLASS_A.id, student_id: "s2", status: "absent" },
        // A mark for someone no longer on the roster doesn't count.
        { class_id: CLASS_A.id, student_id: "gone", status: "present" },
      ],
    });

    expect(lessons.map((l) => [l.className, l.startTime])).toEqual([
      ["Γ Γυμνασίου", "16:00"],
      ["Β Λυκείου", "18:00"],
    ]);
    expect(lessons[0]).toMatchObject({ rosterSize: 3, marked: 2, absent: 1, kind: "recurring" });
    expect(lessons[1]).toMatchObject({ rosterSize: 1, marked: 0, absent: 0 });
  });

  it("shows a cancelled lesson as cancelled", () => {
    const lessons = buildDayLessons({
      date: MONDAY,
      projection: projection({ events: [event({})] }),
      rosterByClass: ROSTERS,
      attendance: [],
    });

    expect(lessons.find((l) => l.classId === CLASS_A.id)?.kind).toBe("cancelled");
  });

  it("lists a class meeting twice once, preferring the lesson that still happens", () => {
    const lessons = buildDayLessons({
      date: MONDAY,
      projection: projection({
        slots: [
          { classId: CLASS_A.id, day: "Mon", time: "14:30" },
          { classId: CLASS_A.id, day: "Mon", time: "18:00" },
        ],
        events: [event({ start_time: "14:30" })],
      }),
      rosterByClass: ROSTERS,
      attendance: [],
    });

    expect(lessons).toHaveLength(1);
    expect(lessons[0]).toMatchObject({ kind: "recurring", startTime: "18:00" });
  });

  it("includes an extra session", () => {
    const lessons = buildDayLessons({
      date: "2026-09-08",
      projection: projection({
        events: [
          event({
            event_type: "extra_session",
            event_date: "2026-09-08",
            start_time: "17:00",
            end_time: "18:00",
          }),
        ],
      }),
      rosterByClass: ROSTERS,
      attendance: [],
    });

    expect(lessons).toEqual([
      expect.objectContaining({ classId: CLASS_A.id, kind: "extra_session", timeLabel: "17:00–18:00" }),
    ]);
  });
});

describe("lessonInProgress", () => {
  // Mon 16:00 grid slot → real lesson 16:15–17:00 (the 15-minute break rule);
  // Mon 18:00 → 18:15–19:00.
  const lessons = () =>
    buildDayLessons({ date: MONDAY, projection: projection(), rosterByClass: ROSTERS, attendance: [] });
  const at = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  };

  it("works out each lesson's real window", () => {
    expect(lessons().map((l) => [l.startMinutes, l.endMinutes])).toEqual([
      [at("16:15"), at("17:00")],
      [at("18:15"), at("19:00")],
    ]);
  });

  it.each([
    ["16:04", null],
    ["16:05", CLASS_A.id],
    ["16:40", CLASS_A.id],
    ["17:15", CLASS_A.id],
    ["17:16", null],
    ["18:10", CLASS_B.id],
  ])("at %s → %s", (time, classId) => {
    expect(lessonInProgress(lessons(), at(time))?.classId ?? null).toBe(classId);
  });

  it("ignores a cancelled lesson", () => {
    const cancelled = buildDayLessons({
      date: MONDAY,
      projection: projection({ events: [event({})] }),
      rosterByClass: ROSTERS,
      attendance: [],
    });
    expect(lessonInProgress(cancelled, at("16:30"))).toBeNull();
  });

  it("uses an extra session's own times", () => {
    const extra = buildDayLessons({
      date: "2026-09-08",
      projection: projection({
        events: [
          event({ event_type: "extra_session", event_date: "2026-09-08", start_time: "10:00", end_time: "12:00" }),
        ],
      }),
      rosterByClass: ROSTERS,
      attendance: [],
    });
    expect(lessonInProgress(extra, at("11:30"))?.classId).toBe(CLASS_A.id);
    expect(lessonInProgress(extra, at("12:16"))).toBeNull();
  });
});

describe("lesson days around a date", () => {
  it("finds the previous and next days with lessons", () => {
    expect(neighbouringLessonDays({ date: MONDAY, projection: projection() })).toEqual({
      previous: "2026-09-03",
      next: "2026-09-10",
    });
  });

  it("skips a fully cancelled day", () => {
    const result = neighbouringLessonDays({
      date: "2026-09-03",
      projection: projection({
        events: [event({}), event({ id: "evt-b", class_id: CLASS_B.id, class_name: CLASS_B.name })],
      }),
    });
    expect(result.next).toBe("2026-09-10");
  });

  it("finds a class's next three lessons after a date", () => {
    expect(nextLessonDays(CLASS_A.id, MONDAY, projection())).toEqual([
      "2026-09-10",
      "2026-09-14",
      "2026-09-17",
    ]);
    expect(nextLessonDays(CLASS_B.id, MONDAY, projection())).toEqual([
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
    expect(nextLessonDays("unknown", MONDAY, projection())).toEqual([]);
  });

  it("skips cancelled lessons and counts a class meeting twice a day once", () => {
    const days = nextLessonDays(
      CLASS_A.id,
      MONDAY,
      projection({
        slots: [
          { classId: CLASS_A.id, day: "Thu", time: "14:30" },
          { classId: CLASS_A.id, day: "Thu", time: "18:00" },
        ],
        events: [event({ event_date: "2026-09-10" })],
      }),
    );
    expect(days).toEqual(["2026-09-17", "2026-09-24", "2026-10-01"]);
  });

  it("adds days across month ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("teacherHomeFor", () => {
  it.each([
    [true, undefined, "/teacher-app"],
    [true, "console", "/protected/teacher"],
    [true, "companion", "/teacher-app"],
    [false, undefined, "/protected/teacher"],
    [false, "companion", "/teacher-app"],
    [false, "nonsense", "/protected/teacher"],
  ])("phone=%s cookie=%s → %s", (isMobile, cookie, home) => {
    expect(teacherHomeFor({ isMobile, cookie })).toBe(home);
  });
});

describe("buildDayHolidays", () => {
  const holidayEvents = [
    event({
      id: "h1",
      class_id: CLASS_A.id,
      start_time: "16:00",
      notes: "28η Οκτωβρίου",
      cancellation_reason: "public_holiday",
      closure_id: "closure-1",
      closure_from: MONDAY,
      closure_to: MONDAY,
    }),
    event({
      id: "h2",
      class_id: CLASS_B.id,
      class_name: CLASS_B.name,
      start_time: "18:00",
      notes: "28η Οκτωβρίου",
      cancellation_reason: "public_holiday",
      closure_id: "closure-1",
      closure_from: MONDAY,
      closure_to: MONDAY,
    }),
  ];

  it("turns a holiday's cancelled lessons into one entry with its note", () => {
    const holidays = buildDayHolidays({
      date: MONDAY,
      projection: projection({ events: holidayEvents }),
    });
    expect(holidays).toHaveLength(1);
    expect(holidays[0]).toMatchObject({
      reason: "public_holiday",
      note: "28η Οκτωβρίου",
      closureIds: ["closure-1"],
    });
    expect(holidays[0].lessons).toHaveLength(2);
  });

  it("carries the reason onto the cancelled lessons, so the Today screen can hide them", () => {
    const lessons = buildDayLessons({
      date: MONDAY,
      projection: projection({ events: holidayEvents }),
      rosterByClass: ROSTERS,
      attendance: [],
    });
    expect(lessons.map((l) => [l.kind, l.cancellationReason])).toEqual([
      ["cancelled", "public_holiday"],
      ["cancelled", "public_holiday"],
    ]);
  });

  it("is empty for a strike - those lessons stay listed one by one", () => {
    expect(
      buildDayHolidays({
        date: MONDAY,
        projection: projection({
          events: [event({ id: "s", start_time: "16:00", cancellation_reason: "strike", closure_id: "c" })],
        }),
      }),
    ).toEqual([]);
  });
});

describe("buildDayEventLessons", () => {
  const events = [
    event({
      id: "one-off",
      event_type: "ad_hoc_lesson",
      class_id: null,
      class_name: null,
      student_id: "s1",
      student_name: "Ada Lovelace",
      start_time: "15:00",
    }),
    event({
      id: "trial",
      event_type: "trial_lesson",
      class_id: null,
      class_name: null,
      contact_name: "Νίκος",
      start_time: "19:00",
      trial_outcome: "no_show",
    }),
  ];

  it("lists one-off and trial lessons with their mark or outcome", () => {
    expect(
      buildDayEventLessons({
        date: MONDAY,
        projection: projection({ events }),
        statusByEventId: new Map([["one-off", "present"]]),
      }),
    ).toEqual([
      expect.objectContaining({ eventId: "one-off", kind: "ad_hoc_lesson", name: "Ada Lovelace", status: "present", trialOutcome: null }),
      expect.objectContaining({ eventId: "trial", kind: "trial_lesson", name: "Νίκος", status: "", trialOutcome: "no_show" }),
    ]);
  });

  it("includes the teacher's personal blocks by their title", () => {
    expect(
      buildDayEventLessons({
        date: MONDAY,
        projection: projection({
          events: [
            event({
              id: "block",
              event_type: "block",
              class_id: null,
              class_name: null,
              title: "Λογιστής",
              start_time: "12:00",
              end_time: "13:00",
            }),
          ],
        }),
        statusByEventId: new Map(),
      }),
    ).toEqual([
      expect.objectContaining({ eventId: "block", kind: "block", name: "Λογιστής", timeLabel: "12:00–13:00" }),
    ]);
  });

  it("makes a day with only a one-off reachable from the date strip", () => {
    const tuesday = addDays(MONDAY, 1);
    const onlyOneOff = projection({
      slots: [],
      events: [event({ id: "x", event_type: "ad_hoc_lesson", class_id: null, class_name: null, student_id: "s1", student_name: "Ada", start_time: "15:00", event_date: tuesday })],
    });
    expect(neighbouringLessonDays({ date: MONDAY, projection: onlyOneOff }).next).toBe(tuesday);
  });
});
