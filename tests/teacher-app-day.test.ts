import { describe, expect, it } from "vitest";
import type { ProjectionEvent } from "@/lib/calendar-projection";
import {
  addDays,
  buildDayLessons,
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
