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
import {
  parseTitle,
  plainTitle,
  tagToken,
  type DirectoryEntry,
  type TagKind,
  type TaskDirectory,
} from "@/lib/task-tags";
import { normalizeGreekPhone } from "@/lib/teacher-app/phone";

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

// A title with tags (lib/task-tags.ts): every tagged student, parent and
// class must be the teacher's own, and tokens are re-written from the parse
// so nothing but well-formed tokens is stored.
async function cleanTitle(
  supabase: SupabaseServerClient,
  userId: string,
  title: string,
): Promise<string> {
  const segments = parseTitle(title.trim());
  const visible = plainTitle(title.trim()).trim();
  if (!visible) throw new ExpectedError("Write what needs doing");
  if (visible.length > TASK_TITLE_MAX_LENGTH) {
    throw new ExpectedError(`Keep it under ${TASK_TITLE_MAX_LENGTH} characters`);
  }

  const ids = (kind: TagKind) => [
    ...new Set(
      segments.flatMap((segment) =>
        segment.type === "tag" && segment.tag.kind === kind ? [segment.tag.id] : [],
      ),
    ),
  ];
  const [studentIds, parentIds, classIds] = [ids("student"), ids("parent"), ids("class")];
  const [students, parents, classes] = await Promise.all([
    studentIds.length
      ? supabase.from("students").select("id").eq("teacher_id", userId).in("id", studentIds)
      : { data: [], error: null },
    parentIds.length
      ? supabase
          .from("family_parents")
          .select("id, families!inner(teacher_id)")
          .eq("families.teacher_id", userId)
          .in("id", parentIds)
      : { data: [], error: null },
    classIds.length
      ? supabase.from("classes").select("id").eq("teacher_id", userId).in("id", classIds)
      : { data: [], error: null },
  ]);
  for (const [wanted, result] of [
    [studentIds, students],
    [parentIds, parents],
    [classIds, classes],
  ] as const) {
    if (result.error) throw result.error;
    if ((result.data ?? []).length !== wanted.length) {
      throw new ExpectedError("Someone tagged in this task isn't one of your students, parents or classes");
    }
  }

  return segments
    .map((segment) => (segment.type === "text" ? segment.text : tagToken(segment.tag)))
    .join("");
}

/**
 * Everyone the @ picker can tag - active students, their families' parents
 * and active classes - with the numbers call tasks ring.
 */
export async function getTaskDirectoryAction(): Promise<TaskDirectory> {
  const { supabase, userId } = await requireTeacherSession();
  const [students, classes] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, first_name, last_name, phone, family_id, student_class_assignments(classes(name)), families(deleted_at, family_parents(id, name, phone, is_primary))",
      )
      .eq("teacher_id", userId)
      .is("withdrawn_at", null),
    supabase
      .from("classes")
      .select("id, name")
      .eq("teacher_id", userId)
      .is("archived_at", null)
      .order("name", { ascending: true }),
  ]);
  if (students.error) throw students.error;
  if (classes.error) throw classes.error;

  type StudentRow = {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    family_id: string;
    student_class_assignments: { classes: { name: string } | null }[] | null;
    families: {
      deleted_at: string | null;
      family_parents: { id: string; name: string | null; phone: string | null; is_primary: boolean }[] | null;
    } | null;
  };

  const entries: DirectoryEntry[] = [];
  const childrenByParent = new Map<string, string[]>();
  const parentById = new Map<string, DirectoryEntry>();
  for (const student of (students.data ?? []) as unknown as StudentRow[]) {
    const name = `${student.first_name} ${student.last_name}`.trim();
    entries.push({
      kind: "student",
      id: student.id,
      name,
      detail: (student.student_class_assignments ?? [])
        .map((assignment) => assignment.classes?.name)
        .filter(Boolean)
        .join(", "),
      phone: normalizeGreekPhone(student.phone),
      familyId: student.family_id,
      isPrimary: false,
    });
    if (student.families?.deleted_at) continue;
    for (const parent of student.families?.family_parents ?? []) {
      childrenByParent.set(parent.id, [...(childrenByParent.get(parent.id) ?? []), student.first_name]);
      if (!parentById.has(parent.id)) {
        parentById.set(parent.id, {
          kind: "parent",
          id: parent.id,
          name: parent.name?.trim() || "Parent",
          detail: "",
          phone: normalizeGreekPhone(parent.phone),
          familyId: student.family_id,
          isPrimary: parent.is_primary,
        });
      }
    }
  }
  for (const [id, parent] of parentById) {
    entries.push({ ...parent, detail: `Parent of ${childrenByParent.get(id)!.join(", ")}` });
  }
  for (const row of classes.data ?? []) {
    entries.push({ kind: "class", id: row.id, name: row.name, detail: "Class", phone: null, familyId: null, isPrimary: false });
  }
  return { entries };
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
  | { kind: "personal"; title: string; date: string; time?: string | null; isCall?: boolean }
  | {
      kind: "lesson";
      title: string;
      date: string;
      phase: TaskPhase;
      lesson: LessonRef;
      isCall?: boolean;
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
    title: await cleanTitle(supabase, userId, input.title),
    is_call: input.isCall === true,
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
  changes: { title?: string; date?: string; time?: string | null; isCall?: boolean },
): Promise<TeacherTask> {
  const { supabase, userId } = await requireTeacherSession();

  const update: Record<string, unknown> = {};
  if (changes.title !== undefined) update.title = await cleanTitle(supabase, userId, changes.title);
  if (changes.isCall !== undefined) update.is_call = changes.isCall;
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
