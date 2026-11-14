"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { notifyAfterResponse } from "@/lib/push/hooks";
import {
  CLASS_FILES_BUCKET,
  MAX_CLASS_FILE_BYTES,
  NOTE_MAX,
  TITLE_MAX,
  defaultTitle,
  isOwnClassFilePath,
  normalizeLink,
} from "@/lib/class-files";
import type { ClassFile, ClassFileInput } from "@/lib/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CLASS_FILE_COLUMNS =
  "id, class_id, homework_id, kind, title, note, file_name, size_bytes, url, pinned, created_at";

async function requireTeacherSession(): Promise<{
  supabase: SupabaseServerClient;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  await requireTeacher(supabase, user.id);
  return { supabase, userId: user.id };
}

function cleanNote(note: string | null | undefined): string | null {
  const trimmed = (note ?? "").trim();
  if (!trimmed) return null;
  if (trimmed.length > NOTE_MAX) throw new ExpectedError(`Keep the note under ${NOTE_MAX} characters`);
  return trimmed;
}

/** A homework item to attach to must be the teacher's, in the same class. */
async function checkedHomeworkId(
  supabase: SupabaseServerClient,
  userId: string,
  classId: string,
  homeworkId: string | null | undefined,
): Promise<string | null> {
  if (!homeworkId) return null;
  const { data, error } = await supabase
    .from("homework")
    .select("id")
    .eq("id", homeworkId)
    .eq("class_id", classId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (error || !data) throw new ExpectedError("That homework item no longer exists");
  return data.id;
}

export async function listClassFilesAction(classId: string): Promise<ClassFile[]> {
  const { supabase, userId } = await requireTeacherSession();
  const { data, error } = await supabase
    .from("class_files")
    .select(CLASS_FILE_COLUMNS)
    .eq("teacher_id", userId)
    .eq("class_id", classId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ClassFile[];
}

/**
 * Posts an uploaded PDF (uploaded from the browser first, see
 * uploadClassFile) or a link to a class, and sends the "new file" notice.
 */
export async function createClassFileAction(input: ClassFileInput): Promise<ClassFile> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id, name")
    .eq("id", input.classId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (classError || !classRow) throw new ExpectedError("That class no longer exists");

  const homeworkId = await checkedHomeworkId(supabase, userId, classRow.id, input.homeworkId);
  const note = cleanNote(input.note);

  let row: Record<string, unknown>;
  if (input.storagePath) {
    if (!isOwnClassFilePath(input.storagePath, userId, classRow.id)) {
      throw new ExpectedError("That upload doesn't belong to this class");
    }
    const fileName = (input.fileName ?? "").trim().slice(0, 255) || "file.pdf";
    const size = Number(input.sizeBytes);
    if (!Number.isInteger(size) || size <= 0 || size > MAX_CLASS_FILE_BYTES) {
      throw new ExpectedError("PDFs must be 20 MB or smaller");
    }
    row = {
      kind: "file",
      storage_path: input.storagePath,
      file_name: fileName,
      size_bytes: size,
      title: defaultTitle(input.title, fileName),
    };
  } else {
    const url = normalizeLink(input.url ?? "");
    if (!url) throw new ExpectedError("Paste a link, or pick a PDF");
    const title = (input.title ?? "").trim();
    if (!title) throw new ExpectedError("Give the link a title");
    row = { kind: "link", url, title: title.slice(0, TITLE_MAX) };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("class_files")
    .insert({
      ...row,
      teacher_id: userId,
      class_id: classRow.id,
      homework_id: homeworkId,
      note,
    })
    .select(CLASS_FILE_COLUMNS)
    .single();
  if (insertError) throw insertError;

  const file = inserted as ClassFile;
  if (input.notify !== false) {
    notifyAfterResponse({
      event: "class_file",
      to: { kind: "class_students", classId: classRow.id },
      classId: classRow.id,
      values: { class: classRow.name, title: file.title },
      tag: `class-file-${file.id}`,
      triggeredBy: userId,
    });
  }
  return file;
}

/** Rename, change the note, attach to (or detach from) homework, pin. */
export async function updateClassFileAction(
  fileId: string,
  changes: { title?: string; note?: string | null; homeworkId?: string | null; pinned?: boolean },
): Promise<ClassFile> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: existingError } = await supabase
    .from("class_files")
    .select("id, class_id")
    .eq("id", fileId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (existingError || !existing) throw new ExpectedError("That file no longer exists");

  const update: Record<string, unknown> = {};
  if (changes.title !== undefined) {
    const title = changes.title.trim();
    if (!title) throw new ExpectedError("Give the file a title");
    update.title = title.slice(0, TITLE_MAX);
  }
  if (changes.note !== undefined) update.note = cleanNote(changes.note);
  if (changes.homeworkId !== undefined) {
    update.homework_id = await checkedHomeworkId(supabase, userId, existing.class_id, changes.homeworkId);
  }
  if (changes.pinned !== undefined) update.pinned = Boolean(changes.pinned);

  const { data, error } = await supabase
    .from("class_files")
    .update(update)
    .eq("id", fileId)
    .eq("teacher_id", userId)
    .select(CLASS_FILE_COLUMNS)
    .single();
  if (error) throw error;
  return data as ClassFile;
}

/** Removes the post and, for an uploaded PDF, the stored file. */
export async function deleteClassFileAction(fileId: string): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: existingError } = await supabase
    .from("class_files")
    .select("id, storage_path")
    .eq("id", fileId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing) return;

  const { error } = await supabase
    .from("class_files")
    .delete()
    .eq("id", fileId)
    .eq("teacher_id", userId);
  if (error) throw error;

  if (existing.storage_path) {
    // Best effort: the post is gone either way, and an orphaned object is
    // unreachable for students (no row points at it).
    await supabase.storage.from(CLASS_FILES_BUCKET).remove([existing.storage_path]);
  }
}

/** Removes an upload that was never saved (the teacher cancelled). */
export async function discardClassFileUploadAction(classId: string, storagePath: string): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();
  if (!isOwnClassFilePath(storagePath, userId, classId)) return;
  const { data } = await supabase
    .from("class_files")
    .select("id")
    .eq("storage_path", storagePath)
    .maybeSingle();
  if (data) return;
  await supabase.storage.from(CLASS_FILES_BUCKET).remove([storagePath]);
}
