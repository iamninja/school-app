// The quiz time limit, as the server checks it on submission
// (app/student-dashboard/quiz-actions.ts). The countdown on the student's
// device auto-submits at zero; this is the server's own view of the same
// deadline. Pure; tests in tests/quiz-timing.test.ts.

/** Slack for the auto-submit's trip to the server and small clock drift. */
export const QUIZ_GRACE_SECONDS = 120;

/**
 * How late a timed quiz was handed in, in whole seconds past the time
 * limit, or null when it's on time (within the grace), untimed, or has no
 * recorded start. A late quiz is still accepted - the teacher sees it.
 */
export function quizLateBySeconds(
  startedAt: string | null | undefined,
  timeLimitMinutes: number | null | undefined,
  now: Date,
  graceSeconds = QUIZ_GRACE_SECONDS,
): number | null {
  if (!startedAt || !timeLimitMinutes || timeLimitMinutes <= 0) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  const overBy = Math.floor((now.getTime() - (started + timeLimitMinutes * 60_000)) / 1000);
  return overBy > graceSeconds ? overBy : null;
}

/** "40 min" / "2 h 5 min" / "3 days", for the teacher's "late" badge. */
export function formatLateBy(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}
