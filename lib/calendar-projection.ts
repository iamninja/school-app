import { format, parse } from "date-fns";
import type { CalendarEvent } from "@/lib/types/database";

// Pure projection logic shared by the teacher's Calendar tab, the
// Attendance tab's date picker (via lib/attendance-dates.ts), and the
// parent/student portal "upcoming" cards. No Supabase import here - every
// caller already has scheduleSlots/calendarEvents fetched, and keeping this
// pure is what makes it directly unit-testable.

export type WeekdayLabel = "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

// Index matches Date#getDay(). Same ordering as teacher-dashboard's
// DAY_LABELS - kept as a separate copy here rather than imported, since
// that file is a client component and this module needs to stay import-free
// of it for testability.
export const WEEKDAY_LABELS: readonly WeekdayLabel[] = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
];

export function weekdayLabelFromDate(date: Date): WeekdayLabel {
  return WEEKDAY_LABELS[date.getDay()];
}

// Local-calendar yyyy-MM-dd. Never date.toISOString().slice(0, 10) - in
// Greece (UTC+2/+3) that reads back the PREVIOUS day for a local-midnight
// Date. date-fns' format() operates on local time components, which is what
// we want here.
export function toIsoDate(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// Local midnight for that calendar date - the inverse of toIsoDate.
export function fromIsoDate(iso: string): Date {
  return parse(iso, "yyyy-MM-dd", new Date());
}

export function eachIsoDateInRange(from: string, to: string): string[] {
  const end = fromIsoDate(to).getTime();
  const dates: string[] = [];
  const cursor = fromIsoDate(from);
  while (cursor.getTime() <= end) {
    dates.push(toIsoDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export interface ProjectionSlot {
  classId: string;
  day: string;
  time: string;
  isTwoHour?: boolean;
}

export interface ProjectionClass {
  id: string;
  name: string;
  archivedAt: string | null;
  // Optional so callers that don't carry a class's date window (tests, the
  // portal "upcoming" cards) keep today's "project indefinitely" behavior -
  // only a caller that actually threads these through opts into gating.
  startDate?: string | null;
  finishDate?: string | null;
}

export type ProjectionEvent = Pick<
  CalendarEvent,
  | "id"
  | "event_type"
  | "event_date"
  | "start_time"
  | "end_time"
  | "class_id"
  | "class_name"
  | "student_id"
  | "student_name"
  | "contact_name"
  | "title"
  | "notes"
>;

export type OccurrenceKind =
  | "recurring"
  | "cancelled"
  | "extra_session"
  | "ad_hoc_lesson"
  | "trial_lesson"
  | "block";

export interface Occurrence {
  date: string;
  kind: OccurrenceKind;
  startTime: string | null;
  endTime: string | null;
  classId: string | null;
  className: string | null;
  studentId: string | null;
  studentName: string | null;
  contactName: string | null;
  title: string | null;
  notes: string | null;
  /** null for a pure template occurrence with no override; the calendar_events.id otherwise. */
  eventId: string | null;
  /** The template slot time this came from, when it came from one. */
  slotTime: string | null;
  /** True for a two-hour lesson (from a two-hour template slot, or an event whose start/end span at least 120 minutes). */
  isTwoHour: boolean;
}

function eventSpansTwoHours(startTime: string | null, endTime: string | null): boolean {
  if (!startTime || !endTime) return false;
  const [startHours, startMinutes] = startTime.split(":").map(Number);
  const [endHours, endMinutes] = endTime.split(":").map(Number);
  const minutes = endHours * 60 + endMinutes - (startHours * 60 + startMinutes);
  return minutes >= 120;
}

export interface ProjectionInput {
  /** inclusive */
  from: string;
  /** inclusive */
  to: string;
  slots: ProjectionSlot[];
  classes: ProjectionClass[];
  events: ProjectionEvent[];
  /** default false - archived classes are hidden from every other active surface */
  includeArchivedClasses?: boolean;
  /** default true; the portals pass false since blocks are teacher-only */
  includeBlocks?: boolean;
}

interface CancellationCoverage {
  wholeDayEventId: string | null;
  /** start_time -> event id, for a specific-occurrence cancellation */
  timesCovered: Map<string, string>;
  allEventIds: string[];
}

export function projectOccurrences(input: ProjectionInput): Occurrence[] {
  const includeArchivedClasses = input.includeArchivedClasses ?? false;
  const includeBlocks = input.includeBlocks ?? true;

  const classById = new Map<string, ProjectionClass>();
  for (const cls of input.classes) {
    if (cls.archivedAt && !includeArchivedClasses) continue;
    classById.set(cls.id, cls);
  }

  const cancellationsByClassDate = new Map<string, CancellationCoverage>();
  for (const event of input.events) {
    if (event.event_type !== "cancellation" || !event.class_id) continue;
    const key = `${event.class_id}|${event.event_date}`;
    const existing: CancellationCoverage = cancellationsByClassDate.get(
      key,
    ) ?? {
      wholeDayEventId: null,
      timesCovered: new Map(),
      allEventIds: [],
    };
    existing.allEventIds.push(event.id);
    if (event.start_time === null) {
      existing.wholeDayEventId = event.id;
    } else {
      existing.timesCovered.set(event.start_time, event.id);
    }
    cancellationsByClassDate.set(key, existing);
  }

  const occurrences: Occurrence[] = [];
  const matchedCancellationIds = new Set<string>();

  for (const date of eachIsoDateInRange(input.from, input.to)) {
    const weekday = weekdayLabelFromDate(fromIsoDate(date));

    for (const slot of input.slots) {
      if (slot.day !== weekday) continue;
      const cls = classById.get(slot.classId);
      if (!cls) continue;
      if (cls.startDate && date < cls.startDate) continue;
      if (cls.finishDate && date > cls.finishDate) continue;

      const coverage = cancellationsByClassDate.get(`${slot.classId}|${date}`);
      const matchedEventId =
        coverage?.wholeDayEventId ?? coverage?.timesCovered.get(slot.time) ?? null;
      if (matchedEventId) matchedCancellationIds.add(matchedEventId);

      occurrences.push({
        date,
        kind: matchedEventId ? "cancelled" : "recurring",
        startTime: slot.time,
        // Left null, same as before two-hour slots existed - the real
        // teaching window (break-adjusted, 1 or 2 rows) is a display/overlap
        // concern computed on demand via recurringLessonWindow(), not baked
        // in here. See teacher-calendar.tsx's effectiveWindow().
        endTime: null,
        classId: slot.classId,
        className: cls.name,
        studentId: null,
        studentName: null,
        contactName: null,
        title: null,
        notes: null,
        eventId: matchedEventId,
        slotTime: slot.time,
        isTwoHour: slot.isTwoHour ?? false,
      });
    }
  }

  for (const event of input.events) {
    if (event.event_date < input.from || event.event_date > input.to) continue;

    if (event.event_type === "cancellation") {
      // A cancellation with no matching template slot that weekday (the
      // schedule was edited after cancelling, or the class has no template
      // at all) would otherwise be invisible and undeletable from the day
      // detail panel - emit it standalone from its own snapshot.
      if (!matchedCancellationIds.has(event.id)) {
        occurrences.push({
          date: event.event_date,
          kind: "cancelled",
          startTime: event.start_time,
          endTime: event.end_time,
          classId: event.class_id,
          className: event.class_name,
          studentId: null,
          studentName: null,
          contactName: null,
          title: null,
          notes: event.notes,
          eventId: event.id,
          slotTime: null,
          isTwoHour: eventSpansTwoHours(event.start_time, event.end_time),
        });
      }
      continue;
    }

    if (event.event_type === "extra_session") {
      // A deleted class (class_id null) still renders from its snapshot.
      // An archived class is filtered out unless explicitly included -
      // same treatment every other active-selection surface gives archived
      // classes.
      if (event.class_id && !classById.has(event.class_id)) continue;
      occurrences.push({
        date: event.event_date,
        kind: "extra_session",
        startTime: event.start_time,
        endTime: event.end_time,
        classId: event.class_id,
        className: event.class_name,
        studentId: null,
        studentName: null,
        contactName: null,
        title: null,
        notes: event.notes,
        eventId: event.id,
        slotTime: null,
        isTwoHour: eventSpansTwoHours(event.start_time, event.end_time),
      });
      continue;
    }

    if (event.event_type === "ad_hoc_lesson") {
      occurrences.push({
        date: event.event_date,
        kind: "ad_hoc_lesson",
        startTime: event.start_time,
        endTime: event.end_time,
        classId: null,
        className: null,
        studentId: event.student_id,
        studentName: event.student_name,
        contactName: null,
        title: null,
        notes: event.notes,
        eventId: event.id,
        slotTime: null,
        isTwoHour: eventSpansTwoHours(event.start_time, event.end_time),
      });
      continue;
    }

    if (event.event_type === "trial_lesson") {
      occurrences.push({
        date: event.event_date,
        kind: "trial_lesson",
        startTime: event.start_time,
        endTime: event.end_time,
        classId: null,
        className: null,
        studentId: null,
        studentName: null,
        contactName: event.contact_name,
        title: null,
        notes: event.notes,
        eventId: event.id,
        slotTime: null,
        isTwoHour: eventSpansTwoHours(event.start_time, event.end_time),
      });
      continue;
    }

    if (event.event_type === "block") {
      if (!includeBlocks) continue;
      occurrences.push({
        date: event.event_date,
        kind: "block",
        startTime: event.start_time,
        endTime: event.end_time,
        classId: null,
        className: null,
        studentId: null,
        studentName: null,
        contactName: null,
        title: event.title,
        notes: event.notes,
        isTwoHour: eventSpansTwoHours(event.start_time, event.end_time),
        eventId: event.id,
        slotTime: null,
      });
    }
  }

  occurrences.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.startTime === b.startTime) return 0;
    if (a.startTime === null) return -1;
    if (b.startTime === null) return 1;
    return a.startTime < b.startTime ? -1 : 1;
  });

  return occurrences;
}

export function groupOccurrencesByDate(
  list: Occurrence[],
): Map<string, Occurrence[]> {
  const map = new Map<string, Occurrence[]>();
  for (const occurrence of list) {
    const bucket = map.get(occurrence.date);
    if (bucket) {
      bucket.push(occurrence);
    } else {
      map.set(occurrence.date, [occurrence]);
    }
  }
  return map;
}

export function nextOccurrences(
  input: ProjectionInput,
  limit: number,
): Occurrence[] {
  return projectOccurrences(input).slice(0, limit);
}
