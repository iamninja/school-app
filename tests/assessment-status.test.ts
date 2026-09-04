import { describe, it, expect } from "vitest";
import {
  computeDueAt,
  isAssessmentAssignmentLate,
  upsertAssessmentAssignment,
} from "@/lib/assessment-status";
import type { TeacherAssessmentAssignmentRow } from "@/lib/types/database";

describe("computeDueAt", () => {
  it("returns null for a short_assessment with no deadline (open)", () => {
    expect(
      computeDueAt({
        kind: "short_assessment",
        effectiveScheduledDate: null,
        effectiveScheduledTime: null,
        effectiveDeadlineAt: null,
      }),
    ).toBeNull();
  });

  it("returns the deadline instant for a short_assessment with a deadline", () => {
    const due = computeDueAt({
      kind: "short_assessment",
      effectiveScheduledDate: null,
      effectiveScheduledTime: null,
      effectiveDeadlineAt: "2026-09-10T15:00:00.000Z",
    });
    expect(due?.toISOString()).toBe("2026-09-10T15:00:00.000Z");
  });

  it("returns end-of-day local time for a mock_exam with no time set", () => {
    const due = computeDueAt({
      kind: "mock_exam",
      effectiveScheduledDate: "2026-09-10",
      effectiveScheduledTime: null,
      effectiveDeadlineAt: null,
    });
    expect(due?.getHours()).toBe(23);
    expect(due?.getMinutes()).toBe(59);
  });

  it("returns the exact scheduled time for a mock_exam with a time set", () => {
    const due = computeDueAt({
      kind: "mock_exam",
      effectiveScheduledDate: "2026-09-10",
      effectiveScheduledTime: "09:30",
      effectiveDeadlineAt: null,
    });
    expect(due?.getHours()).toBe(9);
    expect(due?.getMinutes()).toBe(30);
  });
});

describe("isAssessmentAssignmentLate", () => {
  const NOW = new Date("2026-09-10T12:00:00.000Z");

  it("is never late when a short_assessment has no deadline", () => {
    expect(
      isAssessmentAssignmentLate(
        {
          kind: "short_assessment",
          effectiveScheduledDate: null,
          effectiveScheduledTime: null,
          effectiveDeadlineAt: null,
          takenAt: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("is not late while not yet taken and the deadline hasn't passed", () => {
    expect(
      isAssessmentAssignmentLate(
        {
          kind: "short_assessment",
          effectiveScheduledDate: null,
          effectiveScheduledTime: null,
          effectiveDeadlineAt: "2026-09-15T00:00:00.000Z",
          takenAt: null,
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("is late (live) when not yet taken and the deadline has passed", () => {
    expect(
      isAssessmentAssignmentLate(
        {
          kind: "short_assessment",
          effectiveScheduledDate: null,
          effectiveScheduledTime: null,
          effectiveDeadlineAt: "2026-09-01T00:00:00.000Z",
          takenAt: null,
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("is not late when taken before the deadline", () => {
    expect(
      isAssessmentAssignmentLate(
        {
          kind: "short_assessment",
          effectiveScheduledDate: null,
          effectiveScheduledTime: null,
          effectiveDeadlineAt: "2026-09-15T00:00:00.000Z",
          takenAt: "2026-09-10T00:00:00.000Z",
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("is late when taken after the deadline, permanently (independent of now)", () => {
    const input = {
      kind: "short_assessment" as const,
      effectiveScheduledDate: null,
      effectiveScheduledTime: null,
      effectiveDeadlineAt: "2026-09-01T00:00:00.000Z",
      takenAt: "2026-09-05T00:00:00.000Z",
    };
    // Still late a year later - this is the "marked but stays late" case.
    expect(isAssessmentAssignmentLate(input, new Date("2027-09-01"))).toBe(true);
    expect(isAssessmentAssignmentLate(input, NOW)).toBe(true);
  });

  it("applies the same taken-late permanence to a mock_exam", () => {
    expect(
      isAssessmentAssignmentLate(
        {
          kind: "mock_exam",
          effectiveScheduledDate: "2026-09-01",
          effectiveScheduledTime: "09:00",
          effectiveDeadlineAt: null,
          takenAt: "2026-09-01T12:00:00.000Z",
        },
        new Date("2028-01-01"),
      ),
    ).toBe(true);
  });
});

describe("upsertAssessmentAssignment", () => {
  const ROW: TeacherAssessmentAssignmentRow = {
    id: "assignment-1",
    assessment_id: "assessment-1",
    student_id: "student-1",
    kind: "short_assessment",
    effective_scheduled_date: null,
    effective_scheduled_time: null,
    effective_deadline_at: null,
    taken_at: null,
    status: "registered",
    score: null,
    teacher_comment: null,
    created_at: "2026-09-01T00:00:00.000Z",
    studentName: "Ada Lovelace",
    isLate: false,
  };

  it("adds a new row when none exists with that id", () => {
    expect(upsertAssessmentAssignment([], ROW)).toEqual([ROW]);
  });

  it("replaces the existing row with the same id, leaving others untouched", () => {
    const other: TeacherAssessmentAssignmentRow = { ...ROW, id: "assignment-2" };
    const updated: TeacherAssessmentAssignmentRow = { ...ROW, status: "taken" };
    expect(upsertAssessmentAssignment([ROW, other], updated)).toEqual([
      updated,
      other,
    ]);
  });
});
