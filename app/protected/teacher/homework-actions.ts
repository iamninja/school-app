"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import type { Homework, HomeworkInput, TeacherHomeworkListItem } from "@/lib/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const HOMEWORK_COLUMNS = "id, class_id, note, due_date, created_at";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

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

// Shared by create/update - turns a raw Postgres CHECK violation into a
// readable ExpectedError before it ever reaches the database.
function validateHomeworkFields(input: {
  note: string;
  dueDate?: string | null;
}): { note: string; due_date: string | null } {
  const note = input.note.trim();
  if (!note) {
    throw new ExpectedError("Give the homework a note");
  }
  if (input.dueDate && !isValidDateString(input.dueDate)) {
    throw new ExpectedError("Pick a valid due date");
  }
  return { note, due_date: input.dueDate || null };
}

type RawHomeworkRow = Homework & { classes: { name: string } | null };

function toTeacherHomeworkListItem(row: RawHomeworkRow): TeacherHomeworkListItem {
  const { classes, ...homework } = row;
  return { ...homework, className: classes?.name ?? "" };
}

export async function listHomeworkAction(): Promise<TeacherHomeworkListItem[]> {
  const { supabase, userId } = await requireTeacherSession();

  const { data, error } = await supabase
    .from("homework")
    .select(`${HOMEWORK_COLUMNS}, classes:class_id (name)`)
    .eq("teacher_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as RawHomeworkRow[]).map(
    toTeacherHomeworkListItem,
  );
}

export async function createHomeworkAction(
  input: HomeworkInput,
): Promise<TeacherHomeworkListItem> {
  const { supabase, userId } = await requireTeacherSession();

  const fields = validateHomeworkFields(input);

  // Ownership re-validation: class_id is never trusted from the client -
  // re-fetched scoped by teacher_id, and this fetch doubles as the
  // className source for the returned list item.
  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", input.classId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (classError || !classRow) {
    throw new ExpectedError("That class no longer exists");
  }

  const { data: inserted, error: insertError } = await supabase
    .from("homework")
    .insert({
      teacher_id: userId,
      class_id: classRow.id,
      note: fields.note,
      due_date: fields.due_date,
    })
    .select(HOMEWORK_COLUMNS)
    .single();
  if (insertError) throw insertError;

  return {
    ...(inserted as unknown as Homework),
    className: classRow.name,
  };
}

export async function updateHomeworkAction(
  homeworkId: string,
  input: { note: string; dueDate?: string | null },
): Promise<TeacherHomeworkListItem> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: existingError } = await supabase
    .from("homework")
    .select(`${HOMEWORK_COLUMNS}, classes:class_id (name)`)
    .eq("id", homeworkId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (existingError || !existing) {
    throw new ExpectedError("That homework item no longer exists");
  }

  const fields = validateHomeworkFields(input);

  const { data: updated, error: updateError } = await supabase
    .from("homework")
    .update({ note: fields.note, due_date: fields.due_date })
    .eq("id", homeworkId)
    .eq("teacher_id", userId)
    .select(HOMEWORK_COLUMNS)
    .single();
  if (updateError) throw updateError;

  return toTeacherHomeworkListItem({
    ...(updated as unknown as Homework),
    classes: (existing as unknown as RawHomeworkRow).classes,
  });
}

export async function deleteHomeworkAction(homeworkId: string): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();

  const { error } = await supabase
    .from("homework")
    .delete()
    .eq("id", homeworkId)
    .eq("teacher_id", userId);
  if (error) throw error;
}
