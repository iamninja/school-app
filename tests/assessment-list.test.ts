import { describe, expect, it } from "vitest";

import {
  NO_FILTERS,
  assessmentDay,
  assessmentGroup,
  groupAssessments,
  progressByAssessment,
  schoolYearStart,
} from "@/lib/assessment-list";
import type { TeacherAssessmentAssignmentRow, TeacherAssessmentListItem } from "@/lib/types/database";

const TODAY = "2026-11-12";

function assessment(o: Partial<TeacherAssessmentListItem>): TeacherAssessmentListItem {
  return {
    id: "a",
    kind: "mock_exam",
    title: "Test",
    description: null,
    max_score: 20,
    duration_minutes: 90,
    scheduled_date: "2026-11-20",
    scheduled_time: null,
    deadline_at: null,
    class_id: "c1",
    class_name: "Β Λυκείου",
    grade: "lyk_b",
    created_at: "2026-10-01T10:00:00Z",
    assignmentCount: 0,
    markedCount: 0,
    ...o,
  };
}

function row(assessmentId: string, status: TeacherAssessmentAssignmentRow["status"], isLate = false): TeacherAssessmentAssignmentRow {
  return {
    id: `${assessmentId}-${status}-${Math.random()}`,
    assessment_id: assessmentId,
    student_id: "s",
    kind: "mock_exam",
    effective_scheduled_date: null,
    effective_scheduled_time: null,
    effective_deadline_at: null,
    taken_at: status === "registered" ? null : "2026-11-01T10:00:00Z",
    status,
    score: status === "marked" ? 15 : null,
    teacher_comment: null,
    graded_paper_url: null,
    created_at: "",
    studentName: "",
    isLate,
  };
}

describe("progress and groups", () => {
  it("counts overdue students apart from those who took it late", () => {
    const progress = progressByAssessment([
      row("a", "registered", true),
      row("a", "registered"),
      row("a", "taken", true),
      row("a", "marked"),
    ]).get("a")!;
    expect(progress).toEqual({ count: 4, toMark: 1, marked: 1, overdue: 1, late: 1 });
  });

  it.each([
    [{ count: 0, toMark: 0, marked: 0, overdue: 0, late: 0 }, "attention"],
    [{ count: 3, toMark: 0, marked: 3, overdue: 0, late: 1 }, "done"],
    [{ count: 3, toMark: 1, marked: 2, overdue: 0, late: 0 }, "attention"],
    [{ count: 3, toMark: 0, marked: 0, overdue: 1, late: 0 }, "attention"],
    [{ count: 3, toMark: 0, marked: 0, overdue: 0, late: 0 }, "upcoming"],
  ] as const)("%o -> %s", (progress, group) => {
    expect(assessmentGroup(progress)).toBe(group);
  });
});

describe("dates", () => {
  it("files an assessment under its exam date, deadline or, when open, the day it was made", () => {
    expect(assessmentDay(assessment({ scheduled_date: "2026-11-20" }))).toBe("2026-11-20");
    // 22:30 UTC on 30 Nov is 1 Dec in Athens.
    expect(assessmentDay(assessment({ kind: "short_assessment", deadline_at: "2026-11-30T22:30:00Z" }))).toBe("2026-12-01");
    expect(assessmentDay(assessment({ kind: "short_assessment", deadline_at: null }))).toBe("2026-10-01");
  });

  it("starts the school year on 1 September", () => {
    expect(schoolYearStart("2026-11-12")).toBe("2026-09-01");
    expect(schoolYearStart("2027-03-01")).toBe("2026-09-01");
    expect(schoolYearStart("2026-09-01")).toBe("2026-09-01");
    expect(schoolYearStart("2026-08-31")).toBe("2025-09-01");
  });
});

describe("groupAssessments", () => {
  const assessments = [
    assessment({ id: "late", title: "Άλγεβρα", scheduled_date: "2026-11-05" }),
    assessment({ id: "soon", title: "Γεωμετρία", scheduled_date: "2026-11-25", class_id: "c2", grade: "gym_c" }),
    assessment({ id: "later", title: "Παράγωγοι", scheduled_date: "2026-12-10" }),
    assessment({ id: "done-new", title: "Τριγωνομετρία", scheduled_date: "2026-10-20" }),
    assessment({ id: "done-old", title: "Πολυώνυμα", scheduled_date: "2026-05-10" }),
    assessment({ id: "open-old", title: "Εξισώσεις", scheduled_date: "2026-04-10" }),
    assessment({ id: "empty", title: "Κενό", kind: "short_assessment", scheduled_date: null }),
  ];
  const rows = [
    row("late", "registered", true),
    row("soon", "registered"),
    row("later", "registered"),
    row("done-new", "marked"),
    row("done-old", "marked"),
    row("open-old", "taken"),
  ];

  it("sorts into needs attention, upcoming and done, each by date", () => {
    const groups = groupAssessments(assessments, rows, NO_FILTERS, TODAY);
    expect(groups.attention.map((r) => r.assessment.id)).toEqual(["open-old", "empty", "late"]);
    expect(groups.upcoming.map((r) => r.assessment.id)).toEqual(["soon", "later"]);
    expect(groups.done.map((r) => r.assessment.id)).toEqual(["done-new"]);
    expect(groups.earlierYears).toBe(1);
  });

  it("shows earlier years' finished ones when asked", () => {
    const groups = groupAssessments(assessments, rows, { ...NO_FILTERS, includeEarlierYears: true }, TODAY);
    expect(groups.done.map((r) => r.assessment.id)).toEqual(["done-new", "done-old"]);
    expect(groups.earlierYears).toBe(0);
  });

  it("filters by class, grade, kind and an accent-insensitive title search", () => {
    const ids = (filters: Partial<typeof NO_FILTERS>) => {
      const g = groupAssessments(assessments, rows, { ...NO_FILTERS, ...filters }, TODAY);
      return [...g.attention, ...g.upcoming, ...g.done].map((r) => r.assessment.id);
    };
    expect(ids({ classId: "c2" })).toEqual(["soon"]);
    expect(ids({ grade: "gym_c" })).toEqual(["soon"]);
    expect(ids({ kind: "short_assessment" })).toEqual(["empty"]);
    expect(ids({ search: "γεωμετρια" })).toEqual(["soon"]);
    expect(ids({ search: "ΑΛΓΕΒ" })).toEqual(["late"]);
  });
});
