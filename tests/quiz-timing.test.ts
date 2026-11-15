import { describe, expect, it } from "vitest";

import { QUIZ_GRACE_SECONDS, formatLateBy, quizLateBySeconds } from "@/lib/quiz-timing";

const START = "2026-11-15T10:00:00.000Z";
const at = (iso: string) => new Date(iso);

describe("quizLateBySeconds", () => {
  it("is on time up to the limit plus the grace", () => {
    expect(quizLateBySeconds(START, 30, at("2026-11-15T10:29:59Z"))).toBeNull();
    expect(quizLateBySeconds(START, 30, at("2026-11-15T10:30:00Z"))).toBeNull();
    // The auto-submit's trip to the server fits in the grace.
    expect(quizLateBySeconds(START, 30, at("2026-11-15T10:32:00Z"))).toBeNull();
  });

  it("counts from the end of the time limit once past the grace", () => {
    expect(quizLateBySeconds(START, 30, at("2026-11-15T10:32:01Z"))).toBe(QUIZ_GRACE_SECONDS + 1);
    expect(quizLateBySeconds(START, 30, at("2026-11-15T11:10:00Z"))).toBe(40 * 60);
  });

  it("never calls an untimed or unstarted quiz late", () => {
    expect(quizLateBySeconds(START, null, at("2026-12-01T00:00:00Z"))).toBeNull();
    expect(quizLateBySeconds(START, 0, at("2026-12-01T00:00:00Z"))).toBeNull();
    expect(quizLateBySeconds(null, 30, at("2026-12-01T00:00:00Z"))).toBeNull();
    expect(quizLateBySeconds("not a date", 30, at("2026-12-01T00:00:00Z"))).toBeNull();
  });
});

describe("formatLateBy", () => {
  it("reads naturally", () => {
    expect(formatLateBy(20)).toBe("1 min");
    expect(formatLateBy(40 * 60)).toBe("40 min");
    expect(formatLateBy(125 * 60)).toBe("2 h 5 min");
    expect(formatLateBy(3 * 3600)).toBe("3 h");
    expect(formatLateBy(3 * 24 * 3600)).toBe("3 days");
  });
});
