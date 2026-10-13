import { BILLING_TIME_ZONE } from "@/lib/billing/school-year";

/**
 * Wall-clock helpers for Europe/Athens, the school's time zone. Every
 * notification rule ("today", "tomorrow evening at 20:00", quiet hours) is
 * about the time on the classroom wall, not the server's UTC clock.
 */

const PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: BILLING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function athensParts(at: Date) {
  const parts = Object.fromEntries(
    PARTS.formatToParts(at).map((part) => [part.type, part.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** Today's date in Athens, 'YYYY-MM-DD'. */
export function athensToday(now: Date = new Date()): string {
  return athensParts(now).date;
}

/** Minutes since midnight on the Athens wall clock. */
export function athensMinutesNow(now: Date = new Date()): number {
  return athensParts(now).minutes;
}

/** 'HH:MM' -> minutes since midnight. */
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/** Adds whole days to a 'YYYY-MM-DD' date (calendar arithmetic, no DST). */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return result.toISOString().slice(0, 10);
}

/**
 * The UTC instant of an Athens wall-clock date + time. Found by guessing
 * the offset and correcting it, which handles the DST switch correctly.
 */
export function athensDateTimeToUtc(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const target = timeToMinutes(time);
  let guess = new Date(Date.UTC(y, m - 1, d, 0, target));
  for (let i = 0; i < 2; i++) {
    const parts = athensParts(guess);
    const dayDiff =
      (Date.parse(`${parts.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
      60000;
    const drift = dayDiff + parts.minutes - target;
    if (drift === 0) break;
    guess = new Date(guess.getTime() - drift * 60000);
  }
  return guess;
}

/**
 * Whether `now` falls inside quiet hours. Handles a window that crosses
 * midnight (22:00-08:00) as well as one that doesn't (13:00-15:00).
 */
export function isInQuietHours(
  now: Date,
  start: string,
  end: string,
): boolean {
  const minutes = athensMinutesNow(now);
  const from = timeToMinutes(start);
  const to = timeToMinutes(end);
  if (from === to) return false;
  return from < to
    ? minutes >= from && minutes < to
    : minutes >= from || minutes < to;
}

/** When the current quiet-hours window ends, as a UTC instant. */
export function quietHoursEnd(now: Date, start: string, end: string): Date {
  const today = athensToday(now);
  const minutes = athensMinutesNow(now);
  const crossesMidnight = timeToMinutes(start) > timeToMinutes(end);
  const endsTomorrow = crossesMidnight && minutes >= timeToMinutes(start);
  return athensDateTimeToUtc(endsTomorrow ? addDaysToDate(today, 1) : today, end);
}

/** 'YYYY-MM-DD' -> '14/10' (how dates read on a lock screen). */
export function formatShortDateEl(date: string): string {
  const [, m, d] = date.split("-");
  return `${Number(d)}/${Number(m)}`;
}
