import { addDaysToDate, formatShortDateEl } from "@/lib/push/athens-time";
import { orthodoxEaster } from "@/lib/push/greek-holidays";
import {
  projectOccurrences,
  type Occurrence,
  type ProjectionInput,
} from "@/lib/calendar-projection";

// School closures - days when no lesson happens at all: the Christmas and
// Easter breaks, public holidays, weather days, strikes. Stored as one
// ordinary cancellation per affected template occurrence, grouped by a
// shared closure_id (see supabase/migrations/*_closure-cancellations.sql).
// Pure, shared by the teacher's "Close days" dialog (preview) and the server
// action (the real write), so both agree on exactly which lessons go.

export const CANCELLATION_REASONS = [
  "christmas",
  "easter",
  "public_holiday",
  "weather",
  "strike",
  "other",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export function isCancellationReason(value: unknown): value is CancellationReason {
  return (CANCELLATION_REASONS as readonly unknown[]).includes(value);
}

export const CANCELLATION_REASON_LABELS_EN: Record<CancellationReason, string> = {
  christmas: "Christmas break",
  easter: "Easter break",
  public_holiday: "Public holiday",
  weather: "Weather",
  strike: "Strike",
  other: "Closed",
};

export const CANCELLATION_REASON_LABELS_EL: Record<CancellationReason, string> = {
  christmas: "Διακοπές Χριστουγέννων",
  easter: "Διακοπές Πάσχα",
  public_holiday: "Αργία",
  weather: "Καιρικές συνθήκες",
  strike: "Απεργία",
  other: "Κλειστά",
};

// A holiday is simply a day off - it reads as "Αργία" / "Διακοπές
// Χριστουγέννων" on its own, not as a cancellation. Weather, strikes and
// other closures are unplanned, so they still say "Ακύρωση · Απεργία".
const HOLIDAY_REASONS: ReadonlySet<CancellationReason> = new Set([
  "christmas",
  "easter",
  "public_holiday",
]);

export function isHolidayReason(reason: CancellationReason | null): boolean {
  return reason !== null && HOLIDAY_REASONS.has(reason);
}

/** The badge text for a cancelled lesson, in whichever language's labels. */
export function cancelledLessonLabel(
  reason: CancellationReason | null,
  cancelledLabel: string,
  reasonLabels: Record<CancellationReason, string>,
): string {
  if (reason === null) return cancelledLabel;
  return isHolidayReason(reason)
    ? reasonLabels[reason]
    : `${cancelledLabel} · ${reasonLabels[reason]}`;
}

/** Longest closure in one go - comfortably covers the Christmas break (15 days). */
export const MAX_CLOSURE_DAYS = 31;

export interface ClosurePreset {
  key: string;
  reason: CancellationReason;
  label: string;
  /** Prefilled into the cancellations' notes - the portals are Greek. */
  noteEl: string | null;
  from: string;
  to: string;
}

// Greek school calendar. The breaks follow the ministry's fixed rule
// (Christmas 24/12-7/1, Easter from Holy Monday to Thomas Sunday); single
// days are the national holidays plus the school-only ones (17/11, 30/1)
// that fall during the school year. 1/1, 6/1, 25-26/12 and Easter Monday
// are inside a break already, so they aren't offered separately.
function presetsForSchoolYear(startYear: number): ClosurePreset[] {
  const next = startYear + 1;
  const easter = orthodoxEaster(next);
  const day = (
    key: string,
    label: string,
    noteEl: string,
    date: string,
  ): ClosurePreset => ({
    key: `${key}-${date.slice(0, 4)}`,
    reason: "public_holiday",
    label,
    noteEl,
    from: date,
    to: date,
  });

  const easterFrom = addDaysToDate(easter, -6);
  const easterTo = addDaysToDate(easter, 7);
  const singles = [
    day("ohi", "28 October", "28η Οκτωβρίου", `${startYear}-10-28`),
    day("polytechnic", "17 November", "Επέτειος Πολυτεχνείου", `${startYear}-11-17`),
    day("three-hierarchs", "Three Hierarchs (30 Jan)", "Τριών Ιεραρχών", `${next}-01-30`),
    day("clean-monday", "Clean Monday", "Καθαρά Δευτέρα", addDaysToDate(easter, -48)),
    day("independence", "25 March", "25η Μαρτίου", `${next}-03-25`),
    day("labour", "Labour Day (1 May)", "Πρωτομαγιά", `${next}-05-01`),
    day("holy-spirit", "Holy Spirit Monday", "Αγίου Πνεύματος", addDaysToDate(easter, 50)),
  ].filter((preset) => preset.from < easterFrom || preset.from > easterTo);

  return [
    {
      key: `christmas-${startYear}`,
      reason: "christmas",
      label: "Christmas break",
      noteEl: null,
      from: `${startYear}-12-24`,
      to: `${next}-01-07`,
    },
    {
      key: `easter-${next}`,
      reason: "easter",
      label: "Easter break",
      noteEl: null,
      from: easterFrom,
      to: easterTo,
    },
    ...singles,
  ];
}

/** The closures still ahead (or under way) within the next year, soonest first. */
export function upcomingClosurePresets(today: string): ClosurePreset[] {
  const year = Number(today.slice(0, 4));
  const horizon = addDaysToDate(today, 366);
  return [year - 1, year, year + 1]
    .flatMap(presetsForSchoolYear)
    .filter((preset) => preset.to >= today && preset.from <= horizon)
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
}

/** '28/10', or '24/12–7/1' for a range - how dates read on a lock screen. */
export function formatClosureRangeEl(from: string, to: string): string {
  return from === to
    ? formatShortDateEl(from)
    : `${formatShortDateEl(from)}–${formatShortDateEl(to)}`;
}

export interface ClosurePlan {
  /** Template occurrences that get a cancellation row. */
  toCancel: Occurrence[];
  /**
   * Lessons in the range that are NOT template occurrences (extra sessions,
   * one-off and trial lessons) - each is its own calendar event, so the
   * teacher deletes or moves them individually; the dialog lists them.
   */
  notCovered: Occurrence[];
}

export function planClosure(
  input: Omit<ProjectionInput, "includeBlocks">,
): ClosurePlan {
  const occurrences = projectOccurrences({ ...input, includeBlocks: false });
  return {
    toCancel: occurrences.filter(
      (occurrence) =>
        occurrence.kind === "recurring" &&
        occurrence.classId !== null &&
        occurrence.slotTime !== null,
    ),
    notCovered: occurrences.filter(
      (occurrence) =>
        occurrence.kind === "extra_session" ||
        occurrence.kind === "ad_hoc_lesson" ||
        occurrence.kind === "trial_lesson",
    ),
  };
}

// The long breaks are expected days off, not news: rather than every class
// crossed out day after day, the calendars show one entry per day and the
// portals one line for the whole break. Display only - the cancellation
// rows stay, since they are what blocks attendance on those days and what
// "Restore whole closure" deletes.
const SCHOOL_BREAK_REASONS: ReadonlySet<CancellationReason> = new Set([
  "christmas",
  "easter",
]);

export function isSchoolBreak(occurrence: Occurrence): boolean {
  return (
    occurrence.kind === "cancelled" &&
    occurrence.cancellationReason !== null &&
    SCHOOL_BREAK_REASONS.has(occurrence.cancellationReason)
  );
}

export interface SchoolBreakItem {
  type: "break";
  reason: CancellationReason;
  /** First and last date of the lessons it stands for. */
  from: string;
  to: string;
  lessons: Occurrence[];
  closureIds: string[];
}

export type ScheduleItem =
  | { type: "lesson"; occurrence: Occurrence }
  | SchoolBreakItem;

function collapse(
  occurrences: Occurrence[],
  keyOf: (occurrence: Occurrence) => string,
): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  const breaks = new Map<string, SchoolBreakItem>();
  for (const occurrence of occurrences) {
    if (!isSchoolBreak(occurrence)) {
      items.push({ type: "lesson", occurrence });
      continue;
    }
    const key = keyOf(occurrence);
    const existing = breaks.get(key);
    if (existing) {
      existing.lessons.push(occurrence);
      if (occurrence.date < existing.from) existing.from = occurrence.date;
      if (occurrence.date > existing.to) existing.to = occurrence.date;
      if (occurrence.closureId && !existing.closureIds.includes(occurrence.closureId)) {
        existing.closureIds.push(occurrence.closureId);
      }
      continue;
    }
    // Takes the place of its first lesson, so the list stays in date order.
    const item: SchoolBreakItem = {
      type: "break",
      reason: occurrence.cancellationReason!,
      from: occurrence.date,
      to: occurrence.date,
      lessons: [occurrence],
      closureIds: occurrence.closureId ? [occurrence.closureId] : [],
    };
    breaks.set(key, item);
    items.push(item);
  }
  return items;
}

/** One break entry per day (the teacher's day panel and week strip). */
export function collapseSchoolBreaksByDay(occurrences: Occurrence[]): ScheduleItem[] {
  return collapse(
    occurrences,
    (occurrence) => `${occurrence.date}|${occurrence.cancellationReason}`,
  );
}

/**
 * One entry for the whole break (the portals' upcoming list). Keyed by
 * reason alone: Christmas and Easter are months apart, so within any list
 * the portals show there is at most one of each.
 */
export function collapseSchoolBreaks(occurrences: Occurrence[]): ScheduleItem[] {
  return collapse(occurrences, (occurrence) => occurrence.cancellationReason ?? "");
}
