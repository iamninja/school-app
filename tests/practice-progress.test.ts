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

describe("carrying progress over", () => {
  const Q1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const Q2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const S1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("adds points and counts, keeps the best and the latest streak, joins mistakes", async () => {
    const { mergeProgress } = await import("@/lib/practice-progress");
    const account = { ...emptyProgress(), points: 100, bestScore: 6, daily: { count: 3, lastDay: "2026-11-14" },
      mistakes: [{ id: Q1, prompt: "a", sectionName: "x", type: "number", right: 1 }], sections: { [S1]: { right: 5, total: 8 } } };
    const guest = { ...emptyProgress(), points: 40, bestScore: 8, daily: { count: 1, lastDay: "2026-11-15" },
      mistakes: [{ id: Q1, prompt: "a", sectionName: "x", type: "number", right: 0 }, { id: Q2, prompt: "b", sectionName: "x", type: "choice", right: 0 }],
      sections: { [S1]: { right: 2, total: 3 } } };
    const merged = mergeProgress(account, guest);
    expect(merged.points).toBe(140);
    expect(merged.bestScore).toBe(8);
    // 3 days up to the 14th, then the 15th: one streak of 4.
    expect(merged.daily).toEqual({ count: 4, lastDay: "2026-11-15" });
    expect(merged.mistakes.map((m) => [m.id, m.right])).toEqual([[Q1, 1], [Q2, 0]]);
    expect(merged.sections[S1]).toEqual({ right: 7, total: 11 });
  });

  it("stores only sane, bounded data from the device", async () => {
    const { sanitizeProgress } = await import("@/lib/practice-progress");
    const clean = sanitizeProgress({
      version: 1, points: -5, bestScore: 99, daily: { count: 2, lastDay: "<script>" },
      mistakes: [{ id: "not-a-uuid", prompt: "x" }, { id: Q1, prompt: "y".repeat(2000), sectionName: "s", type: "number", right: 7 }],
      sections: { [S1]: { right: 9, total: 3 }, junk: { right: 1, total: 1 } },
      lastSections: [S1, "nope"], extra: "dropped",
    });
    expect(clean.points).toBe(0);
    expect(clean.bestScore).toBe(10);
    expect(clean.daily.lastDay).toBeNull();
    expect(clean.mistakes).toHaveLength(1);
    expect(clean.mistakes[0].prompt).toHaveLength(600);
    expect(clean.mistakes[0].right).toBe(2);
    expect(clean.sections).toEqual({ [S1]: { right: 9, total: 9 } });
    expect(clean.lastSections).toEqual([S1]);
    expect(clean).not.toHaveProperty("extra");
    expect(sanitizeProgress("garbage")).toEqual(emptyProgress());
  });
});

describe("mergeDaily", () => {
  it("joins streaks that touch or overlap, keeps the later one after a gap", async () => {
    const { mergeDaily } = await import("@/lib/practice-progress");
    expect(mergeDaily({ count: 3, lastDay: "2026-11-14" }, { count: 1, lastDay: "2026-11-15" })).toEqual({ count: 4, lastDay: "2026-11-15" });
    expect(mergeDaily({ count: 5, lastDay: "2026-11-15" }, { count: 2, lastDay: "2026-11-15" })).toEqual({ count: 5, lastDay: "2026-11-15" });
    expect(mergeDaily({ count: 2, lastDay: "2026-11-12" }, { count: 1, lastDay: "2026-11-15" })).toEqual({ count: 1, lastDay: "2026-11-15" });
    expect(mergeDaily({ count: 0, lastDay: null }, { count: 2, lastDay: "2026-11-15" })).toEqual({ count: 2, lastDay: "2026-11-15" });
    expect(mergeDaily({ count: 2, lastDay: "2026-11-30" }, { count: 1, lastDay: "2026-12-01" })).toEqual({ count: 3, lastDay: "2026-12-01" });
  });
});
