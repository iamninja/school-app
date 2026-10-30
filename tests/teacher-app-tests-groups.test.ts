import { describe, expect, it } from "vitest";

import {
  groupTests,
  isOverdue,
  overdueCount,
  type TestsAssessment,
  type TestsAssignment,
} from "@/lib/teacher-app/assessments";

const TODAY = "2026-10-30";
// 12:00 in Athens (EET, UTC+2, after the October clock change).
const NOW = new Date("2026-10-30T10:00:00Z");

const MOCK: TestsAssessment = {
  id: "mock",
  kind: "mock_exam",
  title: "Mock exam",
  class_name: "Β Λυκείου",
  max_score: 20,
};
const SHORT: TestsAssessment = {
  id: "short",
  kind: "short_assessment",
  title: "Short test",
  class_name: "Γ Γυμνασίου",
  max_score: 10,
};

function mockRow(date: string | null, status: TestsAssignment["status"] = "registered", time = "17:00"): TestsAssignment {
  return {
    assessment_id: "mock",
    status,
    effective_scheduled_date: date,
    effective_scheduled_time: date ? time : null,
    effective_deadline_at: null,
  };
}

function shortRow(deadline: string | null, status: TestsAssignment["status"] = "registered"): TestsAssignment {
  return {
    assessment_id: "short",
    status,
    effective_scheduled_date: null,
    effective_scheduled_time: null,
    effective_deadline_at: deadline,
  };
}

describe("isOverdue", () => {
  it("counts a mock exam overdue only once its day is over", () => {
    expect(isOverdue("mock_exam", mockRow("2026-10-29"), TODAY, NOW)).toBe(true);
    expect(isOverdue("mock_exam", mockRow(TODAY, "registered", "09:00"), TODAY, NOW)).toBe(false);
  });

  it("counts a short test overdue once its deadline has passed; an open one never", () => {
    expect(isOverdue("short_assessment", shortRow("2026-10-30T09:00:00Z"), TODAY, NOW)).toBe(true);
    expect(isOverdue("short_assessment", shortRow("2026-10-30T15:00:00Z"), TODAY, NOW)).toBe(false);
    expect(isOverdue("short_assessment", shortRow(null), TODAY, NOW)).toBe(false);
  });

  it("never counts a taken or marked student", () => {
    expect(isOverdue("mock_exam", mockRow("2026-10-01", "taken"), TODAY, NOW)).toBe(false);
    expect(isOverdue("mock_exam", mockRow("2026-10-01", "marked"), TODAY, NOW)).toBe(false);
  });
});

describe("groupTests", () => {
  it("puts an assessment under each student's own date", () => {
    const groups = groupTests(
      [MOCK],
      [mockRow("2026-10-28"), mockRow(TODAY), mockRow(TODAY), mockRow("2026-11-03"), mockRow("2026-10-28", "taken")],
      TODAY,
      NOW,
    );
    expect(groups.overdue).toHaveLength(1);
    expect(groups.overdue[0]).toMatchObject({ count: 1, total: 5, taken: 1, when: { date: "2026-10-28" } });
    expect(groups.today[0]).toMatchObject({ count: 2, when: { date: TODAY, time: "17:00" } });
    expect(groups.upcoming[0]).toMatchObject({ count: 1, when: { date: "2026-11-03" } });
    expect(groups.awaitingMarks).toHaveLength(0);
  });

  it("files a short test by its deadline's Athens date", () => {
    // 22:30 UTC on 30 Oct is 00:30 on 31 Oct in Athens - tomorrow, not today.
    const groups = groupTests([SHORT], [shortRow("2026-10-30T22:30:00Z")], TODAY, NOW);
    expect(groups.upcoming).toHaveLength(1);
    const dueToday = groupTests([SHORT], [shortRow("2026-10-30T16:00:00Z")], TODAY, NOW);
    expect(dueToday.today[0].when).toEqual({ date: TODAY, time: "18:00" });
  });

  it("lists open short tests at the end of upcoming", () => {
    const groups = groupTests(
      [SHORT, MOCK],
      [shortRow(null), mockRow("2026-11-05")],
      TODAY,
      NOW,
    );
    expect(groups.upcoming.map((item) => item.assessment.id)).toEqual(["mock", "short"]);
    expect(groups.upcoming[1].when.date).toBeNull();
  });

  it("leaves out dates beyond the upcoming window", () => {
    const groups = groupTests([MOCK], [mockRow("2026-11-20")], TODAY, NOW);
    expect(groups.upcoming).toHaveLength(0);
  });

  it("moves a fully taken assessment to waiting for marks, and drops it once all are marked", () => {
    const waiting = groupTests([MOCK], [mockRow("2026-10-20", "taken"), mockRow("2026-10-20", "marked")], TODAY, NOW);
    expect(waiting.awaitingMarks[0]).toMatchObject({ count: 1, marked: 1, total: 2 });
    expect(waiting.overdue).toHaveLength(0);
    const done = groupTests([MOCK], [mockRow("2026-10-20", "marked")], TODAY, NOW);
    expect(done.awaitingMarks).toHaveLength(0);
  });

  it("skips assessments with no students", () => {
    const groups = groupTests([MOCK], [], TODAY, NOW);
    expect(Object.values(groups).flat()).toHaveLength(0);
  });
});

describe("overdueCount", () => {
  it("counts overdue students across assessments", () => {
    expect(
      overdueCount(
        [MOCK, SHORT],
        [mockRow("2026-10-28"), mockRow("2026-10-28"), mockRow(TODAY), shortRow("2026-10-29T10:00:00Z")],
        TODAY,
        NOW,
      ),
    ).toBe(3);
  });
});
