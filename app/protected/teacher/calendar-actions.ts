"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import type { CalendarEvent, CalendarEventInput } from "@/lib/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CALENDAR_EVENT_COLUMNS =
  "id, event_type, event_date, start_time, end_time, class_id, class_name, " +
  "student_id, student_name, contact_name, contact_phone, title, notes, created_at";

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

  return data as unknown as CalendarEvent;
}

export async function updateCalendarEventAction(
  eventId: string,
  input: CalendarEventInput,
): Promise<CalendarEvent> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("calendar_events")
    .select("event_type")
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

  return data as unknown as CalendarEvent;
}

export async function deleteCalendarEventAction(
  eventId: string,
): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();

  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", eventId)
    .eq("teacher_id", userId);

  if (error) {
    throw error;
  }
}
