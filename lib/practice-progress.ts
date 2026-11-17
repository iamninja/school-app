// A player's practice progress, kept in the browser (localStorage) for now:
// points, the daily streak, the best round, the mistakes pack and how well
// each section is going. Phase 3 moves it to the account for the centre's
// students, carrying this over. Pure; tests in tests/practice-progress.test.ts.

export const PROGRESS_KEY = "modus-practice-v1";
/** A mistake leaves the pack after this many right answers. */
export const RIGHTS_TO_CLEAR = 2;
const MAX_MISTAKES = 200;

export interface PracticeMistake {
  id: string;
  /** The question as it was played, for the list (templates differ each time). */
  prompt: string;
  sectionName: string;
  type: string;
  right: number;
}

export interface PracticeProgress {
  version: 1;
  points: number;
  bestScore: number;
  daily: { count: number; lastDay: string | null };
  mistakes: PracticeMistake[];
  /** sectionId -> answers so far (the mastery bars). */
  sections: Record<string, { right: number; total: number }>;
  lastGrade: string | null;
  lastSections: string[];
}

export function emptyProgress(): PracticeProgress {
  return { version: 1, points: 0, bestScore: 0, daily: { count: 0, lastDay: null }, mistakes: [], sections: {}, lastGrade: null, lastSections: [] };
}

/** Reads stored progress; anything unreadable starts afresh. */
export function parseProgress(raw: string | null): PracticeProgress {
  if (!raw) return emptyProgress();
  try {
    const value = JSON.parse(raw) as Partial<PracticeProgress>;
    if (value?.version !== 1) return emptyProgress();
    const base = emptyProgress();
    return {
      ...base,
      ...value,
      daily: { ...base.daily, ...(value.daily ?? {}) },
      mistakes: Array.isArray(value.mistakes) ? value.mistakes.filter((item) => item && typeof item.id === "string") : [],
      sections: value.sections && typeof value.sections === "object" ? value.sections : {},
      lastSections: Array.isArray(value.lastSections) ? value.lastSections : [],
    };
  } catch {
    return emptyProgress();
  }
}

/** "2026-11-15" in the player's own time zone. */
export function localDay(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayBefore(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return localDay(new Date(year, month - 1, date - 1));
}

/** The streak as it stands today: it's broken if the last practice was before yesterday. */
export function currentDailyStreak(progress: PracticeProgress, today: string): number {
  const last = progress.daily.lastDay;
  if (!last) return 0;
  return last === today || last === dayBefore(today) ? progress.daily.count : 0;
}

export interface AnsweredQuestion {
  id: string;
  sectionId: string;
  sectionName: string;
  type: string;
  prompt: string;
  correct: boolean;
}

/** Points for a right answer: 10, plus 5 from the third right answer in a row. */
export function pointsFor(streakAfterAnswer: number): number {
  return pointsWithBase(streakAfterAnswer, 10);
}

/** pointsFor with another base (a counterexample typed or after switching to the options). */
export function pointsWithBase(streakAfterAnswer: number, base: number): number {
  return base + (streakAfterAnswer >= 3 ? 5 : 0);
}

/** A right counterexample's base points: typed 15, from the options 10, after switching to them 5. */
export const COUNTEREXAMPLE_POINTS = { typed: 15, options: 10, switched: 5 } as const;

/**
 * Records one answer: section counts, and the mistakes pack (a wrong
 * answer goes in, or back to zero rights; a right one counts towards
 * leaving it). Played the day's first answer, it also moves the streak.
 */
export function recordAnswer(
  progress: PracticeProgress,
  answer: AnsweredQuestion,
  pointsGained: number,
  today: string,
): PracticeProgress {
  const sectionStats = progress.sections[answer.sectionId] ?? { right: 0, total: 0 };
  const sections = {
    ...progress.sections,
    [answer.sectionId]: { right: sectionStats.right + (answer.correct ? 1 : 0), total: sectionStats.total + 1 },
  };

  let mistakes = progress.mistakes;
  const existing = mistakes.find((item) => item.id === answer.id);
  if (!answer.correct) {
    const entry: PracticeMistake = { id: answer.id, prompt: answer.prompt, sectionName: answer.sectionName, type: answer.type, right: 0 };
    mistakes = [entry, ...mistakes.filter((item) => item.id !== answer.id)].slice(0, MAX_MISTAKES);
  } else if (existing) {
    const right = existing.right + 1;
    mistakes = right >= RIGHTS_TO_CLEAR
      ? mistakes.filter((item) => item.id !== answer.id)
      : mistakes.map((item) => (item.id === answer.id ? { ...item, right } : item));
  }

  const daily =
    progress.daily.lastDay === today
      ? progress.daily
      : { count: currentDailyStreak(progress, today) + 1, lastDay: today };

  return { ...progress, points: progress.points + pointsGained, sections, mistakes, daily };
}

/** At the end of a round: keeps the best score. */
export function recordRoundEnd(progress: PracticeProgress, score: number): PracticeProgress {
  return { ...progress, bestScore: Math.max(progress.bestScore, score) };
}

/** 0..1 - how well a section is going (needs a few answers before it says much). */
export function sectionMastery(progress: PracticeProgress, sectionId: string): number | null {
  const stats = progress.sections[sectionId];
  if (!stats || stats.total === 0) return null;
  // Shrunk towards 0 until there are ~10 answers, so 1 of 1 isn't "mastered".
  return stats.right / Math.max(stats.total, 10);
}

/**
 * Folds one progress into another - a guest's browser progress into the
 * student's account the first time they play logged in, or two devices'
 * copies. Points add up, the best and the longer streak win, mistakes and
 * section counts are combined.
 */
export function mergeProgress(base: PracticeProgress, extra: PracticeProgress): PracticeProgress {
  const sections: PracticeProgress["sections"] = { ...base.sections };
  for (const [id, stats] of Object.entries(extra.sections)) {
    const current = sections[id] ?? { right: 0, total: 0 };
    sections[id] = { right: current.right + stats.right, total: current.total + stats.total };
  }
  const seen = new Set(base.mistakes.map((mistake) => mistake.id));
  const mistakes = [...base.mistakes, ...extra.mistakes.filter((mistake) => !seen.has(mistake.id))].slice(0, MAX_MISTAKES);
  const daily = mergeDaily(base.daily, extra.daily);
  return {
    ...base,
    points: base.points + extra.points,
    bestScore: Math.max(base.bestScore, extra.bestScore),
    daily,
    mistakes,
    sections,
    lastGrade: base.lastGrade ?? extra.lastGrade,
    lastSections: base.lastSections.length ? base.lastSections : extra.lastSections,
  };
}

/** Day number (days since 1970) of a "YYYY-MM-DD" local day. */
function dayNumber(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, date) / 86_400_000);
}

/**
 * Two streaks as one: each covers the days up to its lastDay. If they
 * touch or overlap (no missed day between them), the joined streak runs
 * from the earlier start to the later end; otherwise the later one counts.
 */
export function mergeDaily(a: PracticeProgress["daily"], b: PracticeProgress["daily"]): PracticeProgress["daily"] {
  if (!a.lastDay || a.count <= 0) return b;
  if (!b.lastDay || b.count <= 0) return a;
  const [early, late] = a.lastDay <= b.lastDay ? [a, b] : [b, a];
  const lateEnd = dayNumber(late.lastDay!);
  const lateStart = lateEnd - late.count + 1;
  const earlyEnd = dayNumber(early.lastDay!);
  const earlyStart = earlyEnd - early.count + 1;
  if (earlyEnd < lateStart - 1) return late;
  return { count: lateEnd - Math.min(earlyStart, lateStart) + 1, lastDay: late.lastDay };
}

/** Has this progress anything worth carrying over? */
export function hasProgress(progress: PracticeProgress): boolean {
  return progress.points > 0 || progress.mistakes.length > 0 || Object.keys(progress.sections).length > 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What the server stores: parsed again, bounded, nothing but the known fields. */
export function sanitizeProgress(value: unknown): PracticeProgress {
  const parsed = parseProgress(JSON.stringify(value ?? null));
  const sections: PracticeProgress["sections"] = {};
  for (const [id, stats] of Object.entries(parsed.sections).slice(0, 500)) {
    if (!UUID.test(id) || !stats) continue;
    const right = Math.max(0, Math.floor(Number(stats.right) || 0));
    const total = Math.max(right, Math.floor(Number(stats.total) || 0));
    sections[id] = { right, total };
  }
  const clip = (text: unknown, max: number) => String(text ?? "").slice(0, max);
  return {
    version: 1,
    points: Math.max(0, Math.min(10_000_000, Math.floor(Number(parsed.points) || 0))),
    bestScore: Math.max(0, Math.min(10, Math.floor(Number(parsed.bestScore) || 0))),
    daily: {
      count: Math.max(0, Math.min(10_000, Math.floor(Number(parsed.daily.count) || 0))),
      lastDay: /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.daily.lastDay)) ? String(parsed.daily.lastDay) : null,
    },
    mistakes: parsed.mistakes
      .filter((mistake) => UUID.test(mistake.id))
      .slice(0, MAX_MISTAKES)
      .map((mistake) => ({
        id: mistake.id,
        prompt: clip(mistake.prompt, 600),
        sectionName: clip(mistake.sectionName, 120),
        type: clip(mistake.type, 20),
        right: Math.max(0, Math.min(RIGHTS_TO_CLEAR, Math.floor(Number(mistake.right) || 0))),
      })),
    sections,
    lastGrade: parsed.lastGrade ? clip(parsed.lastGrade, 20) : null,
    lastSections: parsed.lastSections.filter((id) => UUID.test(String(id))).slice(0, 100),
  };
}

/** What the portals show about practice. */
export interface PracticeSummary {
  /** Is there anything to play at all? */
  available: boolean;
  dailyStreak: number;
  points: number;
  mistakes: number;
  bestScore: number;
}

export function practiceSummary(progress: PracticeProgress | null, today: string, available: boolean): PracticeSummary {
  const p = progress ?? emptyProgress();
  return {
    available,
    dailyStreak: currentDailyStreak(p, today),
    points: p.points,
    mistakes: p.mistakes.length,
    bestScore: p.bestScore,
  };
}

/** What a parent sees about a child's practice. */
export interface ParentPracticeSummary {
  dailyStreak: number;
  weekAnswers: number;
  weekRight: number;
  weekDays: number;
  mistakes: number;
}
