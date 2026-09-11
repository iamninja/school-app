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

export function timeToMinutes(time: string): number {
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
 * A recurring slot's real teaching window, preferring a teacher-set custom
 * `endTime` over the grid-derived one when present. A custom window is
 * always exactly LESSON_MINUTES long - only its position shifts, never its
 * duration - so the start is deduced by subtracting that constant rather
 * than stored separately. See the "custom lesson times" project memory for
 * why this single-column design was chosen over a start+end pair.
 */
export function slotWindow(
  day: string,
  time: string,
  opts: { isTwoHour?: boolean; endTime?: string | null } = {},
): { start: string; end: string } {
  if (opts.endTime) {
    return {
      start: minutesToTime(timeToMinutes(opts.endTime) - LESSON_MINUTES),
      end: opts.endTime,
    };
  }
  return recurringLessonWindow(day, time, opts.isTwoHour);
}

// A clock time's position on a day's grid axis, in row units: the integer
// part is the row index, the fractional part is how far into that row's own
// real-duration span the time falls (0 = the row's top edge, 1 = its bottom
// edge / the next row's top edge). Every row occupies exactly 1.0 unit
// regardless of its real duration (45 vs 60 minutes) - that's what makes a
// row-unit distance directly proportional to the grid's actual pixel
// geometry once rows are rendered at a uniform height, even though a
// weekday row's real duration isn't uniform (rows 0-1 are 45 min, the rest
// are 60). Returns null for a time outside every row's span - shouldn't
// happen given setScheduleSlotTimesAction's own bounds check, but the
// caller falls back to whole-cell rendering rather than trusting that.
function timeToRowPosition(day: string, time: string): number | null {
  const column: "time" | "satTime" = day === "Sat" ? "satTime" : "time";
  const minutes = timeToMinutes(time);
  for (let i = 0; i < SCHEDULE_ROWS.length; i++) {
    const rowStart = timeToMinutes(SCHEDULE_ROWS[i][column]);
    const nextRow = SCHEDULE_ROWS[i + 1];
    const rowEnd = nextRow ? timeToMinutes(nextRow[column]) : rowStart + 60;
    if (minutes >= rowStart && minutes <= rowEnd) {
      return i + (minutes - rowStart) / (rowEnd - rowStart);
    }
  }
  return null;
}

/**
 * Where a real (possibly cross-row) window sits within the Schedule tab's
 * grid, for rendering a customized lesson's card at its exact position
 * instead of filling its whole grid cell. `startRow`/`endRow` are the grid
 * row indexes the card's wrapper must span; `topPct`/`heightPct` position
 * the card within that spanning wrapper (not within a single row - a
 * wrapper spanning N rows is N times taller than one row, so these are
 * fractions of the whole span). Returns null if the window falls outside
 * the grid entirely, in which case the caller should render the old
 * whole-cell way rather than nothing.
 */
export function windowToRowGeometry(
  day: string,
  window: { start: string; end: string },
): { startRow: number; endRow: number; topPct: number; heightPct: number } | null {
  const startPos = timeToRowPosition(day, window.start);
  const endPos = timeToRowPosition(day, window.end);
  if (startPos === null || endPos === null) return null;

  const startRow = Math.floor(startPos);
  // An end landing exactly on a row boundary belongs to the row above it
  // (the lesson ends at that row's bottom edge) rather than the row below
  // (which it only touches, not enters) - Number.isInteger catches that
  // exact-boundary case; Math.floor alone would put it in the row below.
  const endRow = Number.isInteger(endPos) ? endPos - 1 : Math.floor(endPos);
  const spanRows = endRow - startRow + 1;

  return {
    startRow,
    endRow,
    topPct: ((startPos - startRow) / spanRows) * 100,
    heightPct: ((endPos - startPos) / spanRows) * 100,
  };
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
