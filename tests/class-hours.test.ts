import { describe, expect, it } from "vitest";

import {
  dayRoster,
  dragSource,
  hourIncludes,
  hoursForStudent,
  hoursToPlace,
  normalizeHourStudents,
  studentHours,
} from "@/lib/class-hours";

const [A, B, C] = ["a", "b", "c"];

describe("hourIncludes", () => {
  it("counts everyone in an hour with no list", () => {
    expect(hourIncludes(null, A)).toBe(true);
    expect(hourIncludes(undefined, A)).toBe(true);
    expect(hourIncludes([A, B], C)).toBe(false);
  });
});

describe("hoursToPlace", () => {
  it("is hours_per_week minus the placed hours when nothing is split", () => {
    expect(hoursToPlace(3, [A, B, C], [{ classId: "k", isTwoHour: true }])).toEqual({ everyone: 1, students: [] });
    expect(hoursToPlace(3, [], [{ classId: "k" }])).toEqual({ everyone: 2, students: [] });
  });

  it("leaves the student left out of a split hour their own hour to place", () => {
    const slots = [
      { classId: "k", isTwoHour: true },
      { classId: "k", studentIds: [A, B] },
    ];
    expect(hoursToPlace(3, [A, B, C], slots)).toEqual({ everyone: 0, students: [{ studentId: C, hours: 1 }] });
    expect(hoursToPlace(3, [A, B, C], [...slots, { classId: "k", studentIds: [C] }])).toEqual({ everyone: 0, students: [] });
  });

  it("keeps the class chip for hours everyone still needs", () => {
    expect(hoursToPlace(3, [A, B, C], [{ classId: "k", studentIds: [A, B] }])).toEqual({
      everyone: 2,
      students: [{ studentId: C, hours: 1 }],
    });
  });
});

describe("studentHours and hoursForStudent", () => {
  const slots = [
    { classId: "k", isTwoHour: true, day: "Mon" },
    { classId: "k", studentIds: [A, B], day: "Mon" },
    { classId: "k", studentIds: [C], day: "Wed" },
  ];
  it("adds up only a student's own hours", () => {
    expect(studentHours(A, slots)).toBe(3);
    expect(studentHours(C, slots)).toBe(3);
    expect(hoursForStudent(slots, C).map((slot) => slot.day)).toEqual(["Mon", "Wed"]);
    expect(hoursForStudent(slots, A)).toHaveLength(2);
  });
});

describe("dayRoster", () => {
  it("is the whole class when any hour that day is for everyone", () => {
    expect(dayRoster([A, B, C], [null, [A, B]])).toEqual([A, B, C]);
    expect(dayRoster([A, B, C], [])).toEqual([A, B, C]);
  });

  it("is only the students listed on a day of split hours", () => {
    expect(dayRoster([A, B, C], [[C]])).toEqual([C]);
    expect(dayRoster([A, B, C], [[A], [B]])).toEqual([A, B]);
    // Someone who left the class drops out.
    expect(dayRoster([A, B], [["gone", A]])).toEqual([A]);
  });
});

describe("normalizeHourStudents", () => {
  it("treats all or none as everyone, and refuses outsiders", () => {
    expect(normalizeHourStudents(null, [A, B, C])).toEqual({ ok: true, studentIds: null });
    expect(normalizeHourStudents([C, B, A], [A, B, C])).toEqual({ ok: true, studentIds: null });
    expect(normalizeHourStudents([B, A, A], [A, B, C])).toEqual({ ok: true, studentIds: [A, B] });
    expect(normalizeHourStudents([], [A, B, C]).ok).toBe(false);
    expect(normalizeHourStudents(["x"], [A, B, C]).ok).toBe(false);
  });
});

describe("dragSource", () => {
  it("reads the class from a dock class chip", () => {
    expect(dragSource("class:c1", undefined)).toEqual({ classId: "c1", studentIds: null });
  });

  it("reads the class and student from a student's own hour chip", () => {
    expect(dragSource("student:c1:s9", undefined)).toEqual({ classId: "c1", studentIds: ["s9"] });
  });

  it("takes a placed card's class and list from its drag data", () => {
    expect(dragSource("scheduled:Mon-17:00", { classId: "c1", studentIds: ["a", "b"] })).toEqual({
      classId: "c1",
      studentIds: ["a", "b"],
    });
    expect(dragSource("scheduled:Mon-17:00", { classId: "c1" })).toEqual({ classId: "c1", studentIds: null });
  });
});
