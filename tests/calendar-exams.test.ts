import { describe, expect, it } from "vitest";

import { examBlocksForDay, examSittings, layoutDay, type ExamSitting } from "@/lib/calendar-exams";

const DAY = "2026-11-20";

function sitting(o: Partial<ExamSitting>): ExamSitting {
  return {
    assessmentId: "a",
    title: "Exam",
    date: DAY,
    startTime: "17:00",
    durationMinutes: 90,
    className: null,
    studentCount: 1,
    ...o,
  };
}

describe("examSittings", () => {
  it("groups students by exam, day and time, and gives a moved student a sitting of their own", () => {
    const assessments = [
      { id: "x", kind: "mock_exam" as const, title: "Άλγεβρα", duration_minutes: 90, scheduled_time: "17:00", class_name: "Β Λυκείου" },
      { id: "s", kind: "short_assessment" as const, title: "Τεστ", duration_minutes: 30, scheduled_time: null, class_name: null },
    ];
    const rows = [
      { assessment_id: "x", kind: "mock_exam" as const, effective_scheduled_date: DAY, effective_scheduled_time: "17:00" },
      { assessment_id: "x", kind: "mock_exam" as const, effective_scheduled_date: DAY, effective_scheduled_time: "17:00" },
      { assessment_id: "x", kind: "mock_exam" as const, effective_scheduled_date: "2026-11-23", effective_scheduled_time: "17:00" },
      { assessment_id: "s", kind: "short_assessment" as const, effective_scheduled_date: null, effective_scheduled_time: null },
    ];
    const sittings = examSittings(assessments, rows);
    expect(sittings).toHaveLength(2);
    expect(sittings.find((s) => s.date === DAY)).toMatchObject({ studentCount: 2, title: "Άλγεβρα", className: "Β Λυκείου" });
    expect(sittings.find((s) => s.date === "2026-11-23")).toMatchObject({ studentCount: 1 });
  });
});

describe("examBlocksForDay", () => {
  it("merges exams that overlap into one block spanning them, and keeps others apart", () => {
    const blocks = examBlocksForDay(
      [
        sitting({ assessmentId: "a", title: "Β", startTime: "17:00", durationMinutes: 90 }),
        sitting({ assessmentId: "b", title: "Α", startTime: "18:00", durationMinutes: 120 }),
        sitting({ assessmentId: "c", title: "Γ", startTime: "20:00", durationMinutes: 60 }),
        sitting({ assessmentId: "d", startTime: "10:00", date: "2026-11-21" }),
      ],
      DAY,
    );
    expect(blocks).toEqual([
      { date: DAY, start: "17:00", end: "20:00", exams: [expect.objectContaining({ title: "Α" }), expect.objectContaining({ title: "Β" })] },
      { date: DAY, start: "20:00", end: "21:00", exams: [expect.objectContaining({ title: "Γ" })] },
    ]);
  });

  it("puts exams with no time in one block of their own", () => {
    const blocks = examBlocksForDay([sitting({ startTime: null }), sitting({ assessmentId: "b", startTime: null })], DAY);
    expect(blocks).toEqual([{ date: DAY, start: null, end: null, exams: expect.any(Array) }]);
    expect(blocks[0].exams).toHaveLength(2);
  });
});

describe("layoutDay", () => {
  type Lesson = { name: string; start: string | null; end: string | null };
  const lessons: Lesson[] = [
    { name: "all-day", start: null, end: null },
    { name: "15:15", start: "15:15", end: "16:00" },
    { name: "17:00", start: "17:00", end: "17:45" },
    { name: "19:00", start: "19:00", end: "19:45" },
  ];
  const windowOf = (lesson: Lesson) => (lesson.start && lesson.end ? { start: lesson.start, end: lesson.end } : null);
  const names = (rows: ReturnType<typeof layoutDay<Lesson>>) =>
    rows.map((row) =>
      row.type === "item"
        ? row.item.name
        : row.type === "exam"
          ? `exam ${row.exam.start ?? "untimed"}`
          : `${row.items.map((item) => item.name).join("+")} | exam ${row.exam.start}`,
    );

  it("puts a lesson overlapping an exam beside it, in its place in the day", () => {
    const blocks = examBlocksForDay([sitting({ startTime: "16:45", durationMinutes: 60 })], DAY);
    expect(names(layoutDay(lessons, windowOf, blocks))).toEqual(["all-day", "15:15", "17:00 | exam 16:45", "19:00"]);
  });

  it("pairs every lesson a long exam overlaps, and places a lone exam in time order", () => {
    const blocks = examBlocksForDay(
      [sitting({ startTime: "15:30", durationMinutes: 120 }), sitting({ assessmentId: "b", startTime: "20:00", durationMinutes: 60 })],
      DAY,
    );
    expect(names(layoutDay(lessons, windowOf, blocks))).toEqual(["all-day", "15:15+17:00 | exam 15:30", "19:00", "exam 20:00"]);
  });

  it("lists an exam with no time first, and an exam before any lesson in order", () => {
    const blocks = examBlocksForDay([sitting({ startTime: null }), sitting({ assessmentId: "b", startTime: "09:00" })], DAY);
    expect(names(layoutDay(lessons, windowOf, blocks))).toEqual(["exam untimed", "all-day", "exam 09:00", "15:15", "17:00", "19:00"]);
  });

  it("leaves a day with no exams as it was", () => {
    expect(names(layoutDay(lessons, windowOf, []))).toEqual(["all-day", "15:15", "17:00", "19:00"]);
  });
});
