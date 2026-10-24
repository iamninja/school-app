"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  TASK_TITLE_MAX_LENGTH,
  TEACHER_TASK_COLUMNS,
  type LessonRef,
  type TaskPhase,
  type TeacherTask,
} from "@/lib/teacher-tasks";

// The teacher's own to-do list - see supabase/migrations/*_teacher-tasks.sql.
// Every query is scoped to the signed-in teacher on top of RLS, the same
// belt-and-braces as calendar-actions.ts.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function cleanTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw new ExpectedError("Write what needs doing");
  if (trimmed.length > TASK_TITLE_MAX_LENGTH) {
    throw new ExpectedError(`Keep it under ${TASK_TITLE_MAX_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * The day range's tasks, plus every still-open task from before `today`
 * (the Overdue list), in one call.
 */
export async function listTasksAction(range: {
  from: string;
  to: string;
  today: string;
}): Promise<TeacherTask[]> {
  const { supabase, userId } = await requireTeacherSession();
  const [inRange, overdue] = await Promise.all([
    supabase
      .from("teacher_tasks")
      .select(TEACHER_TASK_COLUMNS)
      .eq("teacher_id", userId)
      .gte("task_date", range.from)
      .lte("task_date", range.to),
    supabase
      .from("teacher_tasks")
      .select(TEACHER_TASK_COLUMNS)
      .eq("teacher_id", userId)
      .is("done_at", null)
      .lt("task_date", range.today),
  ]);
  if (inRange.error) throw inRange.error;
  if (overdue.error) throw overdue.error;

  const byId = new Map<string, TeacherTask>();
  for (const task of [
    ...((inRange.data ?? []) as unknown as TeacherTask[]),
    ...((overdue.data ?? []) as unknown as TeacherTask[]),
  ]) {
    byId.set(task.id, task);
  }
  return [...byId.values()];
}

export type CreateTaskInput =
  | { kind: "personal"; title: string; date: string; time?: string | null }
  | {
      kind: "lesson";
      title: string;
      date: string;
      phase: TaskPhase;
      lesson: LessonRef;
    };

// The lesson's label is taken from the teacher's own class/event row - the
// same lookup that proves it's theirs - never from the client.
async function resolveLesson(
  supabase: SupabaseServerClient,
  userId: string,
  date: string,
  lesson: LessonRef,
): Promise<Record<string, unknown>> {
  if ("eventId" in lesson) {
    const { data: event, error } = await supabase
      .from("calendar_events")
      .select("id, event_type, event_date, start_time, class_name, student_name, contact_name")
      .eq("id", lesson.eventId)
      .eq("teacher_id", userId)
      .in("event_type", ["extra_session", "ad_hoc_lesson", "trial_lesson"])
      .maybeSingle();
    if (error || !event) {
      throw new ExpectedError("That lesson no longer exists");
    }
    if (event.event_date !== date) {
      throw new ExpectedError("That lesson isn't on this date");
    }
    const name = event.class_name ?? event.student_name ?? event.contact_name ?? "Lesson";
    return {
      calendar_event_id: event.id,
      lesson_label: event.start_time ? `${name} ${event.start_time}` : name,
    };
  }

  if (!TIME_PATTERN.test(lesson.slotTime)) {
    throw new ExpectedError("That lesson's time isn't valid");
  }
  const { data: classRow, error } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", lesson.classId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (error || !classRow) {
    throw new ExpectedError("That class no longer exists");
  }
  return {
    class_id: classRow.id,
    slot_time: lesson.slotTime,
    lesson_label: `${classRow.name} ${lesson.slotTime}`,
  };
}

export async function createTaskAction(input: CreateTaskInput): Promise<TeacherTask> {
  const { supabase, userId } = await requireTeacherSession();
  if (!isValidDate(input.date)) {
    throw new ExpectedError("Pick a valid date");
  }

  const row: Record<string, unknown> = {
    teacher_id: userId,
    kind: input.kind,
    title: cleanTitle(input.title),
    task_date: input.date,
  };

  if (input.kind === "personal") {
    if (input.time && !TIME_PATTERN.test(input.time)) {
      throw new ExpectedError("Enter the time as HH:MM");
    }
    row.task_time = input.time || null;
  } else {
    if (input.phase !== "before" && input.phase !== "after") {
      throw new ExpectedError("Pick before or after the lesson");
    }
    row.phase = input.phase;
    Object.assign(row, await resolveLesson(supabase, userId, input.date, input.lesson));
  }

  const { data, error } = await supabase
    .from("teacher_tasks")
    .insert(row)
    .select(TEACHER_TASK_COLUMNS)
    .single();
  if (error) throw error;
  return data as unknown as TeacherTask;
}

export async function setTaskDoneAction(
  taskId: string,
  done: boolean,
): Promise<TeacherTask> {
  const { supabase, userId } = await requireTeacherSession();
  const { data, error } = await supabase
    .from("teacher_tasks")
    .update({ done_at: done ? new Date().toISOString() : null })
    .eq("id", taskId)
    .eq("teacher_id", userId)
    .select(TEACHER_TASK_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ExpectedError("That task no longer exists");
  return data as unknown as TeacherTask;
}

/**
 * Renames a task; a personal task can also move to another day or time
 * (a lesson task stays with its lesson - delete and re-add it instead).
 */
export async function updateTaskAction(
  taskId: string,
  changes: { title?: string; date?: string; time?: string | null },
): Promise<TeacherTask> {
  const { supabase, userId } = await requireTeacherSession();

  const update: Record<string, unknown> = {};
  if (changes.title !== undefined) update.title = cleanTitle(changes.title);
  if (changes.date !== undefined || changes.time !== undefined) {
    const { data: existing } = await supabase
      .from("teacher_tasks")
      .select("kind")
      .eq("id", taskId)
      .eq("teacher_id", userId)
      .maybeSingle();
    if (!existing) throw new ExpectedError("That task no longer exists");
    if (existing.kind !== "personal") {
      throw new ExpectedError("A lesson's task stays with its lesson");
    }
    if (changes.date !== undefined) {
      if (!isValidDate(changes.date)) throw new ExpectedError("Pick a valid date");
      update.task_date = changes.date;
    }
    if (changes.time !== undefined) {
      if (changes.time && !TIME_PATTERN.test(changes.time)) {
        throw new ExpectedError("Enter the time as HH:MM");
      }
      update.task_time = changes.time || null;
    }
  }

  const { data, error } = await supabase
    .from("teacher_tasks")
    .update(update)
    .eq("id", taskId)
    .eq("teacher_id", userId)
    .select(TEACHER_TASK_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ExpectedError("That task no longer exists");
  return data as unknown as TeacherTask;
}

export async function deleteTaskAction(taskId: string): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();
  const { error } = await supabase
    .from("teacher_tasks")
    .delete()
    .eq("id", taskId)
    .eq("teacher_id", userId);
  if (error) throw error;
}
