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
  return 10 + (streakAfterAnswer >= 3 ? 5 : 0);
}

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
