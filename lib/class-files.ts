// Class files (supabase/migrations/*_class-files.sql): PDFs or links the
// teacher posts to a class. Pure checks shared by the server actions and
// the upload UI, plus the browser-side upload. Tests in
// tests/class-files.test.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassFileSummary } from "@/lib/types/database";

export const CLASS_FILES_BUCKET = "class-files";
/** Keep in step with the bucket's file_size_limit in the migration. */
export const MAX_CLASS_FILE_BYTES = 20 * 1024 * 1024;
export const ALLOWED_CLASS_FILE_TYPES = ["application/pdf"];
export const CLASS_FILE_ACCEPT = ".pdf,application/pdf";
export const TITLE_MAX = 200;
export const NOTE_MAX = 1000;

/** Where a teacher's upload for a class goes: <teacher>/<class>/<uuid>.pdf */
export function classFilePath(teacherId: string, classId: string, id: string): string {
  return `${teacherId}/${classId}/${id}.pdf`;
}

/** Is this a path the teacher may save for this class (their own folder)? */
export function isOwnClassFilePath(path: string, teacherId: string, classId: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === teacherId &&
    parts[1] === classId &&
    /^[0-9a-f-]{36}\.pdf$/i.test(parts[2])
  );
}

/** A file picked for upload: the reason it can't go, or null. */
export function classFileProblem(file: { name: string; type: string; size: number }): string | null {
  const isPdf = ALLOWED_CLASS_FILE_TYPES.includes(file.type) || /\.pdf$/i.test(file.name);
  if (!isPdf) return "Only PDF files can be posted";
  if (file.size <= 0) return "That file is empty";
  if (file.size > MAX_CLASS_FILE_BYTES) return "PDFs must be 20 MB or smaller";
  return null;
}

/** A pasted link, tidied: https:// added if missing; null if it isn't one. */
export function normalizeLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** The title shown for a file: the one typed, else the file name without ".pdf". */
export function defaultTitle(title: string | null | undefined, fileName: string | null | undefined): string {
  const typed = (title ?? "").trim();
  if (typed) return typed.slice(0, TITLE_MAX);
  return (fileName ?? "").replace(/\.pdf$/i, "").trim().slice(0, TITLE_MAX) || "Αρχείο";
}

/** "2.4 MB" / "830 KB" */
export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Is this link a Google Drive/Docs one (for the portal's button label)? */
export function isGoogleDriveLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === "drive.google.com" || host === "docs.google.com";
  } catch {
    return false;
  }
}

/** Where a file opens: the download route checks access and signs a fresh URL. */
export function classFileHref(id: string): string {
  return `/api/class-files/${id}`;
}

/** Pinned first, then newest first. */
export function sortClassFiles<T extends { pinned: boolean; created_at: string }>(files: T[]): T[] {
  return [...files].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at),
  );
}

/** Uploads a picked PDF from the browser. Returns the stored path. */
export async function uploadClassFile(
  supabase: SupabaseClient,
  teacherId: string,
  classId: string,
  file: File,
): Promise<string> {
  const problem = classFileProblem(file);
  if (problem) throw new Error(problem);
  const path = classFilePath(teacherId, classId, crypto.randomUUID());
  const { error } = await supabase.storage
    .from(CLASS_FILES_BUCKET)
    .upload(path, file, { contentType: "application/pdf" });
  if (error) throw error;
  return path;
}

/** The columns the portals read (no storage path: they open via the route). */
export const PORTAL_CLASS_FILE_COLUMNS =
  "id, class_id, homework_id, kind, title, note, size_bytes, url, pinned, created_at";

type PortalClassFileRow = {
  id: string;
  class_id: string;
  homework_id: string | null;
  kind: "file" | "link";
  title: string;
  note: string | null;
  size_bytes: number | null;
  url: string | null;
  pinned: boolean;
  created_at: string;
};

/**
 * What students and parents see: files attached to a homework item go
 * with that item (byHomework), the rest make the class file list (pinned
 * first, newest next). Links open directly; PDFs through the route.
 */
export function portalClassFiles(
  rows: PortalClassFileRow[],
  classNameById: Map<string, string>,
): { files: ClassFileSummary[]; byHomework: Map<string, ClassFileSummary[]> } {
  const files: ClassFileSummary[] = [];
  const byHomework = new Map<string, ClassFileSummary[]>();
  for (const row of sortClassFiles(rows)) {
    const summary: ClassFileSummary = {
      id: row.id,
      classId: row.class_id,
      className: classNameById.get(row.class_id) ?? "",
      kind: row.kind,
      title: row.title,
      note: row.note,
      sizeBytes: row.size_bytes,
      href: row.kind === "link" && row.url ? row.url : classFileHref(row.id),
      isDrive: row.kind === "link" && isGoogleDriveLink(row.url),
      pinned: row.pinned,
      createdAt: row.created_at,
    };
    if (row.homework_id) {
      byHomework.set(row.homework_id, [...(byHomework.get(row.homework_id) ?? []), summary]);
    } else {
      files.push(summary);
    }
  }
  return { files, byHomework };
}
