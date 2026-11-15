import { describe, expect, it } from "vitest";

import { summarizeAnswers } from "@/lib/practice-bank";

const day = (iso: string) => iso.slice(0, 10);

describe("summarizeAnswers", () => {
  it("counts this week's answers, right ones and days, sections and the last time played", () => {
    const now = new Date("2026-11-15T12:00:00Z");
    const rows = [
      { student_id: "a", section_id: "s1", correct: true, answered_at: "2026-11-15T10:00:00Z" },
      { student_id: "a", section_id: "s1", correct: false, answered_at: "2026-11-15T10:01:00Z" },
      { student_id: "a", section_id: "s2", correct: true, answered_at: "2026-11-12T18:00:00Z" },
      { student_id: "a", section_id: "s2", correct: true, answered_at: "2026-11-01T18:00:00Z" },
      { student_id: "b", section_id: null, correct: false, answered_at: "2026-11-14T09:00:00Z" },
    ];
    const summary = summarizeAnswers(rows, now, day);
    expect(summary.get("a")!.week).toEqual({ answers: 3, right: 2, days: 2 });
    expect(Object.fromEntries(summary.get("a")!.recent)).toEqual({ s1: { answers: 2, right: 1 }, s2: { answers: 2, right: 2 } });
    expect(summary.get("a")!.last).toBe("2026-11-15T10:01:00Z");
    expect(summary.get("b")!.week).toEqual({ answers: 1, right: 0, days: 1 });
    expect(summary.get("b")!.recent.size).toBe(0);
  });
});
