import { describe, expect, it } from "vitest";

import {
  currentDailyStreak,
  emptyProgress,
  parseProgress,
  pointsFor,
  recordAnswer,
  recordRoundEnd,
  sectionMastery,
  type AnsweredQuestion,
} from "@/lib/practice-progress";
import { MAX_MISTAKES_PER_ROUND, pickRound, shuffleOptions } from "@/lib/practice-round";
import { seededRng } from "@/lib/practice-template";

const answer = (id: string, correct: boolean): AnsweredQuestion => ({
  id, sectionId: "s1", sectionName: "Η ευθεία", type: "number", prompt: `q ${id}`, correct,
});

describe("practice progress", () => {
  it("survives bad storage", () => {
    expect(parseProgress(null)).toEqual(emptyProgress());
    expect(parseProgress("not json")).toEqual(emptyProgress());
    expect(parseProgress(JSON.stringify({ version: 9 }))).toEqual(emptyProgress());
    expect(parseProgress(JSON.stringify({ version: 1, points: 30, mistakes: [null, { id: "a" }] })).mistakes).toEqual([{ id: "a" }]);
  });

  it("puts wrong answers in the mistakes pack and takes them out after two rights", () => {
    let p = recordAnswer(emptyProgress(), answer("a", false), 0, "2026-11-15");
    expect(p.mistakes.map((m) => [m.id, m.right])).toEqual([["a", 0]]);
    p = recordAnswer(p, answer("a", true), 10, "2026-11-15");
    expect(p.mistakes.map((m) => [m.id, m.right])).toEqual([["a", 1]]);
    p = recordAnswer(p, answer("a", false), 0, "2026-11-15");
    expect(p.mistakes[0].right).toBe(0);
    p = recordAnswer(p, answer("a", true), 10, "2026-11-15");
    p = recordAnswer(p, answer("a", true), 10, "2026-11-15");
    expect(p.mistakes).toEqual([]);
    expect(p.points).toBe(30);
    expect(p.sections.s1).toEqual({ right: 3, total: 5 });
  });

  it("counts the daily streak across days, and breaks it after a missed day", () => {
    let p = recordAnswer(emptyProgress(), answer("a", true), 10, "2026-11-14");
    p = recordAnswer(p, answer("b", true), 10, "2026-11-14");
    expect(p.daily).toEqual({ count: 1, lastDay: "2026-11-14" });
    p = recordAnswer(p, answer("c", true), 10, "2026-11-15");
    expect(p.daily).toEqual({ count: 2, lastDay: "2026-11-15" });
    expect(currentDailyStreak(p, "2026-11-16")).toBe(2);
    expect(currentDailyStreak(p, "2026-11-17")).toBe(0);
    p = recordAnswer(p, answer("d", true), 10, "2026-11-18");
    expect(p.daily).toEqual({ count: 1, lastDay: "2026-11-18" });
    // Across a month end.
    const q = recordAnswer(recordAnswer(emptyProgress(), answer("a", true), 10, "2026-11-30"), answer("b", true), 10, "2026-12-01");
    expect(q.daily.count).toBe(2);
  });

  it("keeps the best score and scores streaks", () => {
    expect(recordRoundEnd({ ...emptyProgress(), bestScore: 7 }, 6).bestScore).toBe(7);
    expect(recordRoundEnd({ ...emptyProgress(), bestScore: 7 }, 9).bestScore).toBe(9);
    expect([1, 2, 3, 4].map(pointsFor)).toEqual([10, 10, 15, 15]);
  });

  it("doesn't call a section mastered after one right answer", () => {
    const p = recordAnswer(emptyProgress(), answer("a", true), 10, "2026-11-15");
    expect(sectionMastery(p, "s1")).toBe(0.1);
    expect(sectionMastery(p, "other")).toBeNull();
  });
});

describe("pickRound", () => {
  const pool = Array.from({ length: 30 }, (_, i) => `q${i}`);

  it("draws 10 different questions from the pool", () => {
    const round = pickRound(pool, [], seededRng(1));
    expect(round).toHaveLength(10);
    expect(new Set(round).size).toBe(10);
    expect(round.every((id) => pool.includes(id))).toBe(true);
  });

  it("brings back a few mistakes that are still in the pool", () => {
    const mistakes = ["q1", "q2", "q3", "q4", "q5", "q6", "gone"];
    for (let seed = 0; seed < 20; seed++) {
      const round = pickRound(pool, mistakes, seededRng(seed));
      const back = round.filter((id) => mistakes.includes(id));
      expect(back.length).toBeGreaterThanOrEqual(MAX_MISTAKES_PER_ROUND);
      expect(round).not.toContain("gone");
    }
  });

  it("plays a short round from a small pool, without repeats", () => {
    expect(pickRound(["a", "b", "c"], ["a"], seededRng(2)).sort()).toEqual(["a", "b", "c"]);
  });

  it("shuffles options and keeps the correct one marked", () => {
    const options = [{ text: "3", correct: true }, { text: "-2", correct: false }, { text: "2/3", correct: false }];
    const firstPlaces = new Set<number>();
    for (let seed = 0; seed < 30; seed++) {
      const shuffled = shuffleOptions(options, seededRng(seed));
      expect(shuffled.filter((option) => option.correct)).toEqual([{ text: "3", correct: true }]);
      firstPlaces.add(shuffled.findIndex((option) => option.correct));
    }
    expect(firstPlaces.size).toBe(3);
  });
});
