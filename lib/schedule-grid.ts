// The weekly schedule grid's rows, shared between the Schedule tab's
// rendering (components/teacher-dashboard.tsx) and the Calendar tab's
// overlap detection (components/teacher-calendar.tsx) - single source of
// truth for what a recurring class's actual teaching window is, since
// class_schedule_slots only ever stores a start time, never a duration.
//
// `time` is the Mon-Fri slot time; `satTime` is the real Saturday clock
// time for that same row (there's no school on Saturday, so cram classes
// can start in the morning - satTime isn't a fixed offset from `time`).
export const SCHEDULE_ROWS: readonly { time: string; satTime: string }[] = [
  { time: "14:30", satTime: "08:00" },
  { time: "15:15", satTime: "09:00" },
  { time: "16:00", satTime: "10:00" },
  { time: "17:00", satTime: "11:00" },
  { time: "18:00", satTime: "12:00" },
  { time: "19:00", satTime: "13:00" },
  { time: "20:00", satTime: "14:00" },
  { time: "21:00", satTime: "15:00" },
  { time: "22:00", satTime: "16:00" },
  { time: "23:00", satTime: "17:00" },
];

const LESSON_MINUTES = 45;

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * The real teaching window for a recurring class occurrence, derived from
 * the grid's own row spacing rather than a single guessed duration -
 * confirmed with the user: every lesson is actually 45 minutes; most slots
 * reserve the first 15 minutes of their hour as a break, but the grid's
 * first two rows (14:30/15:15 weekday, 08:00/09:00 Saturday) run back to
 * back with no gap between them at all. Rather than hardcode which rows are
 * "the exception," this derives it from the actual gap to the next row: a
 * 45-minute gap means no room for a break (the slot's own start IS the
 * lesson's start), a 60-minute gap means the lesson starts 15 minutes in.
 * The last row in each column has no next row to measure against, so it
 * falls back to the standard 60-minute-slot shape.
 */
export function recurringLessonWindow(
  day: string,
  startTime: string,
  isTwoHour = false,
): { start: string; end: string } {
  const column: "time" | "satTime" = day === "Sat" ? "satTime" : "time";
  const index = SCHEDULE_ROWS.findIndex((row) => row[column] === startTime);

  if (index === -1) {
    // Not a recognized grid slot - fall back to the standard shape (15-min
    // break, 45 min of teaching) rather than assuming no break at all.
    const start = timeToMinutes(startTime) + 15;
    const duration = isTwoHour ? LESSON_MINUTES + 60 : LESSON_MINUTES;
    return { start: minutesToTime(start), end: minutesToTime(start + duration) };
  }

  // The lesson's start always follows the single-row break rule, measured
  // against the very next row - unaffected by isTwoHour.
  const nextRow = SCHEDULE_ROWS[index + 1];
  const nextRowMinutes = nextRow
    ? timeToMinutes(nextRow[column])
    : timeToMinutes(startTime) + 60;
  const startMinutes = nextRowMinutes - LESSON_MINUTES;

  // A two-hour lesson spans this row and the next one, so its end is
  // measured against the row *after* that (two rows ahead) instead - same
  // fallback (a flat 60-minute shape per row) when there's no such row.
  const endRow = SCHEDULE_ROWS[index + (isTwoHour ? 2 : 1)];
  const endMinutes = endRow
    ? timeToMinutes(endRow[column])
    : timeToMinutes(startTime) + (isTwoHour ? 120 : 60);
  return { start: minutesToTime(startMinutes), end: minutesToTime(endMinutes) };
}

/**
 * Display label for a lesson's time - just the start ("16:00") for a normal
 * 1-hour lesson, a "start–end" range for a two-hour one or anything with a
 * known real end time (an ad-hoc calendar event's stored end_time takes
 * priority when present). No end time shown means a 1-hour lesson - this is
 * the single display rule used everywhere a lesson time appears (Schedule
 * tab, Calendar tab, class detail, parent/student dashboards).
 */
export function lessonTimeLabel(
  startTime: string,
  isTwoHour: boolean,
  endTime?: string | null,
): string {
  if (endTime) return `${startTime}–${endTime}`;
  if (isTwoHour) {
    return `${startTime}–${minutesToTime(timeToMinutes(startTime) + 120)}`;
  }
  return startTime;
}
