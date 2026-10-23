"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import type {
  CalendarEvent,
  CalendarEventInput,
  TrialOutcome,
} from "@/lib/types/database";
import type { ProjectionEvent } from "@/lib/calendar-projection";
import { notifyAfterResponse } from "@/lib/push/hooks";
import { athensToday } from "@/lib/push/athens-time";
import {
  noticeForCreated,
  noticeForDeleted,
  noticeForMove,
  noticeForUpdated,
  noticesForClosure,
  type CalendarRow,
} from "@/lib/push/lesson-changes";
import { addDaysToDate } from "@/lib/push/athens-time";
import {
  CANCELLATION_REASON_LABELS_EL,
  MAX_CLOSURE_DAYS,
  isCancellationReason,
  planClosure,
  type CancellationReason,
} from "@/lib/school-closures";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CALENDAR_EVENT_COLUMNS =
  "id, event_type, event_date, start_time, end_time, class_id, class_name, " +
  "student_id, student_name, contact_name, contact_phone, title, notes, " +
  "cancellation_reason, closure_id, closure_from, closure_to, " +
  "lesson_price, trial_outcome, created_at";

const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function requireTeacherSession(): Promise<{
  supabase: SupabaseServerClient;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);
  return { supabase, userId: user.id };
}

// null/undefined = not charged. Same bounds as the database check
// (lesson_price > 0, numeric(10, 2)).
function validLessonPrice(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value <= 0 || value >= 100_000_000) {
    throw new ExpectedError("Enter a price above 0, or untick the charge");
  }
  return Math.round(value * 100) / 100;
}

function isValidCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

// Shared by create and update. Snapshots (class_name/student_name) are
// resolved here from a fresh classes/students lookup, never accepted from
// the client: "Teachers manage calendar events" only checks teacher_id, not
// that class_id/student_id actually belong to this teacher, so this lookup
// is the app-layer ownership check - and once it's already been done,
// taking the display name from that same row costs nothing and rules out
// a stale or spoofed snapshot entirely.
async function resolveEventRow(
  supabase: SupabaseServerClient,
  userId: string,
  input: CalendarEventInput,
): Promise<Record<string, unknown>> {
  if (!isValidCalendarDate(input.eventDate)) {
    throw new ExpectedError("Pick a valid date");
  }
  if (input.startTime && !TIME_PATTERN.test(input.startTime)) {
    throw new ExpectedError("Enter a start time as HH:MM");
  }
  if (input.endTime && !TIME_PATTERN.test(input.endTime)) {
    throw new ExpectedError("Enter an end time as HH:MM");
  }
  if (input.startTime && input.endTime && input.endTime <= input.startTime) {
    throw new ExpectedError("End time must be after the start time");
  }

  const row: Record<string, unknown> = {
    teacher_id: userId,
    event_type: input.eventType,
    event_date: input.eventDate,
    start_time: input.startTime || null,
    end_time: input.endTime || null,
    class_id: null,
    class_name: null,
    student_id: null,
    student_name: null,
    contact_name: null,
    contact_phone: null,
    title: null,
    notes: input.notes?.trim() || null,
    lesson_price: null,
  };

  switch (input.eventType) {
    case "cancellation":
    case "extra_session": {
      if (!input.classId) {
        throw new ExpectedError("Pick a class");
      }
      if (input.eventType === "extra_session" && !input.startTime) {
        throw new ExpectedError("Enter a start time");
      }
      const { data: classRow, error } = await supabase
        .from("classes")
        .select("id, name, archived_at")
        .eq("id", input.classId)
        .eq("teacher_id", userId)
        .maybeSingle();
      if (error || !classRow) {
        throw new ExpectedError("That class no longer exists");
      }
      if (input.eventType === "extra_session" && classRow.archived_at) {
        throw new ExpectedError("This class is archived - restore it first");
      }
      row.class_id = classRow.id;
      row.class_name = classRow.name;
      break;
    }
    case "ad_hoc_lesson": {
      if (!input.studentId) {
        throw new ExpectedError("Pick a student");
      }
      if (!input.startTime) {
        throw new ExpectedError("Enter a start time");
      }
      const { data: studentRow, error } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .eq("id", input.studentId)
        .eq("teacher_id", userId)
        .maybeSingle();
      if (error || !studentRow) {
        throw new ExpectedError("That student no longer exists");
      }
      row.student_id = studentRow.id;
      row.student_name =
        `${studentRow.first_name} ${studentRow.last_name}`.trim();
      row.lesson_price = validLessonPrice(input.lessonPrice);
      break;
    }
    case "trial_lesson": {
      const contactName = input.contactName?.trim();
      if (!contactName) {
        throw new ExpectedError("Enter the contact's name");
      }
      if (!input.startTime) {
        throw new ExpectedError("Enter a start time");
      }
      row.contact_name = contactName;
      row.contact_phone = input.contactPhone?.trim() || null;
      break;
    }
    case "block": {
      const title = input.title?.trim();
      if (!title) {
        throw new ExpectedError("Give this block a title");
      }
      row.title = title;
      break;
    }
    default: {
      throw new ExpectedError("Unknown event type");
    }
  }

  return row;
}

export async function listCalendarEventsAction(range?: {
  from: string;
  to: string;
}): Promise<CalendarEvent[]> {
  const { supabase } = await requireTeacherSession();

  let query = supabase
    .from("calendar_events")
    .select(CALENDAR_EVENT_COLUMNS)
    .order("event_date", { ascending: true });

  if (range) {
    query = query.gte("event_date", range.from).lte("event_date", range.to);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as CalendarEvent[];
}

export async function createCalendarEventAction(
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const { supabase, userId } = await requireTeacherSession();
  const row = await resolveEventRow(supabase, userId, input);

  const { data, error } = await supabase
    .from("calendar_events")
    .insert(row)
    .select(CALENDAR_EVENT_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  if (input.notify !== false) {
    const notice = noticeForCreated(data as unknown as CalendarRow, athensToday());
    if (notice) notifyAfterResponse({ ...notice, triggeredBy: userId });
  }

  return data as unknown as CalendarEvent;
}

export async function updateCalendarEventAction(
  eventId: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("calendar_events")
    .select("event_type, event_date, start_time, class_id, class_name, student_id")
    .eq("id", eventId)
    .eq("teacher_id", userId)
    .maybeSingle();

  if (fetchError || !existing) {
    throw new ExpectedError("That event no longer exists");
  }
  // Keeps the update path a strict subset of create's validated shape space
  // - a type change is a different set of required fields, so it goes
  // through delete + recreate instead of trying to migrate the row in place.
  if (existing.event_type !== input.eventType) {
    throw new ExpectedError(
      "An event's type can't be changed - delete it and add a new one.",
    );
  }

  const row = await resolveEventRow(supabase, userId, input);

  const { data, error } = await supabase
    .from("calendar_events")
    .update(row)
    .eq("id", eventId)
    .eq("teacher_id", userId)
    .select(CALENDAR_EVENT_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  if (input.notify !== false) {
    const notice = noticeForUpdated(
      existing as CalendarRow,
      data as unknown as CalendarRow,
      athensToday(),
    );
    if (notice) notifyAfterResponse({ ...notice, triggeredBy: userId });
  }

  return data as unknown as CalendarEvent;
}

export async function deleteCalendarEventAction(
  eventId: string,
  options: { notify?: boolean } = {},
): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();

  // Read first: deleting a cancellation puts the lesson back on, which the
  // students should hear about.
  const { data: existing } = await supabase
    .from("calendar_events")
    .select("event_type, event_date, start_time, class_id, class_name, student_id")
    .eq("id", eventId)
    .eq("teacher_id", userId)
    .maybeSingle();

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", eventId)
    .eq("teacher_id", userId);

  if (error) {
    throw error;
  }

  if (existing && options.notify !== false) {
    const notice = noticeForDeleted(existing as CalendarRow, athensToday());
    if (notice) notifyAfterResponse({ ...notice, triggeredBy: userId });
  }
}

// Moving a single occurrence of a recurring class to a different date/time
// (same day or a different day entirely) - there's no dedicated "moved"
// event type or link between the two rows (deliberate v1 scope: no schema
// change, reuses the existing cancellation/extra_session shapes exactly as
// if the teacher had cancelled the old slot and separately added an extra
// session). The replacement is inserted BEFORE the cancellation on purpose:
// if the cancellation insert then fails, the lesson still exists (briefly
// duplicated) rather than silently vanishing.
export async function rescheduleClassOccurrenceAction(input: {
  classId: string;
  fromDate: string;
  fromStartTime: string;
  toDate: string;
  toStartTime: string;
  toEndTime?: string | null;
  /** Tell the students (default true) - one "moved" notice. */
  notify?: boolean;
}): Promise<{ extraSession: CalendarEvent; cancellation: CalendarEvent }> {
  const { supabase, userId } = await requireTeacherSession();

  if (
    input.fromDate === input.toDate &&
    input.fromStartTime === input.toStartTime
  ) {
    throw new ExpectedError("Pick a different date or time to reschedule to");
  }

  const extraRow = await resolveEventRow(supabase, userId, {
    eventType: "extra_session",
    eventDate: input.toDate,
    startTime: input.toStartTime,
    endTime: input.toEndTime ?? null,
    classId: input.classId,
  });
  const { data: extraSession, error: extraError } = await supabase
    .from("calendar_events")
    .insert(extraRow)
    .select(CALENDAR_EVENT_COLUMNS)
    .single();
  if (extraError) {
    throw extraError;
  }

  const cancellationRow = await resolveEventRow(supabase, userId, {
    eventType: "cancellation",
    eventDate: input.fromDate,
    startTime: input.fromStartTime,
    classId: input.classId,
  });
  const { data: cancellation, error: cancelError } = await supabase
    .from("calendar_events")
    .insert(cancellationRow)
    .select(CALENDAR_EVENT_COLUMNS)
    .single();
  if (cancelError) {
    throw new ExpectedError(
      "Added the new time, but couldn't cancel the original slot - cancel it manually from the Calendar tab.",
    );
  }

  const today = athensToday();
  if (input.notify !== false && (input.fromDate >= today || input.toDate >= today)) {
    const notice = noticeForMove(
      cancellation as unknown as CalendarRow,
      extraSession as unknown as CalendarRow,
    );
    if (notice) notifyAfterResponse({ ...notice, triggeredBy: userId });
  }

  return {
    extraSession: extraSession as unknown as CalendarEvent,
    cancellation: cancellation as unknown as CalendarEvent,
  };
}

// A school closure (Christmas/Easter break, public holiday, weather day,
// strike): every scheduled lesson in the dates gets an ordinary
// cancellation, all sharing one closure_id so the closure can be undone as
// a whole - see supabase/migrations/*_closure-cancellations.sql for why it
// isn't its own event type. Which lessons go is decided here from a fresh
// read (planClosure, the same function the dialog previews with), never
// from a client-supplied list. Lessons already cancelled are skipped, so
// overlapping a closure with an existing one is harmless.
export async function cancelLessonsForClosureAction(input: {
  from: string;
  to: string;
  reason: CancellationReason;
  notes?: string;
  /** Tell the students (default true) - one notice per class. */
  notify?: boolean;
}): Promise<{ closureId: string; cancellations: CalendarEvent[] }> {
  const { supabase, userId } = await requireTeacherSession();

  if (!isValidCalendarDate(input.from) || !isValidCalendarDate(input.to)) {
    throw new ExpectedError("Pick valid dates");
  }
  if (input.to < input.from) {
    throw new ExpectedError("The last day can't be before the first day");
  }
  if (addDaysToDate(input.from, MAX_CLOSURE_DAYS - 1) < input.to) {
    throw new ExpectedError(`Close at most ${MAX_CLOSURE_DAYS} days at a time`);
  }
  if (!isCancellationReason(input.reason)) {
    throw new ExpectedError("Pick a reason");
  }

  const [classes, slots, events] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, archived_at, start_date, finish_date")
      .eq("teacher_id", userId),
    supabase
      .from("class_schedule_slots")
      .select("day, time, class_id, is_two_hour, end_time")
      .eq("teacher_id", userId),
    supabase
      .from("calendar_events")
      .select(
        "id, event_type, event_date, start_time, end_time, class_id, class_name, student_id, student_name, contact_name, title, notes",
      )
      .eq("teacher_id", userId)
      .gte("event_date", input.from)
      .lte("event_date", input.to),
  ]);
  for (const result of [classes, slots, events]) {
    if (result.error) throw result.error;
  }

  const { toCancel } = planClosure({
    from: input.from,
    to: input.to,
    classes: (
      (classes.data ?? []) as Array<{
        id: string;
        name: string;
        archived_at: string | null;
        start_date: string | null;
        finish_date: string | null;
      }>
    ).map((row) => ({
      id: row.id,
      name: row.name,
      archivedAt: row.archived_at,
      startDate: row.start_date,
      finishDate: row.finish_date,
    })),
    slots: (
      (slots.data ?? []) as Array<{
        day: string;
        time: string;
        class_id: string;
        is_two_hour: boolean | null;
        end_time: string | null;
      }>
    ).map((slot) => ({
      classId: slot.class_id,
      day: slot.day,
      time: slot.time,
      isTwoHour: slot.is_two_hour ?? false,
      endTime: slot.end_time,
    })),
    events: (events.data ?? []) as unknown as ProjectionEvent[],
  });

  if (toCancel.length === 0) {
    throw new ExpectedError("There are no scheduled lessons on those days");
  }

  const closureId = crypto.randomUUID();
  const notes = input.notes?.trim() || null;
  const rows = toCancel.map((occurrence) => ({
    teacher_id: userId,
    event_type: "cancellation",
    event_date: occurrence.date,
    start_time: occurrence.slotTime,
    end_time: null,
    class_id: occurrence.classId,
    class_name: occurrence.className,
    student_id: null,
    student_name: null,
    contact_name: null,
    contact_phone: null,
    title: null,
    notes,
    cancellation_reason: input.reason,
    closure_id: closureId,
    closure_from: input.from,
    closure_to: input.to,
  }));

  // One insert, so the closure lands whole or not at all.
  const { data, error } = await supabase
    .from("calendar_events")
    .insert(rows)
    .select(CALENDAR_EVENT_COLUMNS);
  if (error) {
    throw error;
  }
  const cancellations = (data ?? []) as unknown as CalendarEvent[];

  if (input.notify !== false) {
    for (const notice of noticesForClosure(
      cancellations,
      { kind: "closed", reasonLabel: notes ?? CANCELLATION_REASON_LABELS_EL[input.reason] },
      closureId,
      athensToday(),
    )) {
      notifyAfterResponse({ ...notice, triggeredBy: userId });
    }
  }

  return { closureId, cancellations };
}

// Undoes a whole closure: every lesson it cancelled is back on. Lessons the
// teacher restored one by one in the meantime are simply already gone.
export async function restoreClosureAction(
  closureId: string,
  options: { notify?: boolean } = {},
): Promise<{ restoredIds: string[] }> {
  const { supabase, userId } = await requireTeacherSession();

  const { data, error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("teacher_id", userId)
    .eq("closure_id", closureId)
    .eq("event_type", "cancellation")
    .select("id, event_date, class_id, class_name, closure_from, closure_to");
  if (error) {
    throw error;
  }
  const restored = (data ?? []) as Array<{
    id: string;
    event_date: string;
    class_id: string | null;
    class_name: string | null;
    closure_from: string | null;
    closure_to: string | null;
  }>;

  if (options.notify !== false) {
    for (const notice of noticesForClosure(
      restored,
      { kind: "reopened" },
      closureId,
      athensToday(),
    )) {
      notifyAfterResponse({ ...notice, triggeredBy: userId });
    }
  }

  return { restoredIds: restored.map((row) => row.id) };
}

// A trial lesson's came / no-show mark - the teacher's own record (the
// contact isn't a student, so nothing reaches portals or billing). null
// clears it.
export async function setTrialOutcomeAction(
  eventId: string,
  outcome: TrialOutcome | null,
): Promise<CalendarEvent> {
  const { supabase, userId } = await requireTeacherSession();
  if (outcome !== null && outcome !== "came" && outcome !== "no_show") {
    throw new ExpectedError("Unknown trial outcome");
  }

  const { data, error } = await supabase
    .from("calendar_events")
    .update({ trial_outcome: outcome })
    .eq("id", eventId)
    .eq("teacher_id", userId)
    .eq("event_type", "trial_lesson")
    .select(CALENDAR_EVENT_COLUMNS)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    throw new ExpectedError("That trial lesson no longer exists");
  }
  return data as unknown as CalendarEvent;
}
