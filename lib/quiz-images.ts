import type { SupabaseClient } from "@supabase/supabase-js";

export const QUIZ_IMAGES_BUCKET = "quiz-images";
export const MAX_QUIZ_IMAGE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_QUIZ_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60;

function extensionFromMimeType(mimeType: string): string | null {
  const subtype = mimeType.split("/")[1];
  if (!subtype) return null;
  return subtype === "jpeg" ? "jpg" : subtype;
}

function extensionFromPath(path: string): string {
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1] : "bin";
}

/** Uploads a teacher-picked question image, browser-side. Returns the stored object path. */
export async function uploadQuizImage(
  supabase: SupabaseClient,
  teacherId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED_QUIZ_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Images must be JPEG, PNG, WebP, or GIF");
  }
  if (file.size > MAX_QUIZ_IMAGE_BYTES) {
    throw new Error("Images must be 5MB or smaller");
  }

  const extension = extensionFromMimeType(file.type) ?? "bin";
  const path = `${teacherId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(QUIZ_IMAGES_BUCKET)
    .upload(path, file, { contentType: file.type });

  if (error) {
    throw error;
  }

  return path;
}

/** Copies an existing question image to a new object, for duplicateQuizAction - each quiz's images must stay independent. */
export async function copyQuizImage(
  supabase: SupabaseClient,
  sourcePath: string,
  teacherId: string,
): Promise<string> {
  const newPath = `${teacherId}/${crypto.randomUUID()}.${extensionFromPath(sourcePath)}`;

  const { error } = await supabase.storage
    .from(QUIZ_IMAGES_BUCKET)
    .copy(sourcePath, newPath);

  if (error) {
    throw error;
  }

  return newPath;
}

/** Batch-signs object paths for display. Skips any path that fails to sign rather than failing the whole batch. */
export async function signQuizImageUrls(
  supabase: SupabaseClient,
  paths: string[],
): Promise<Map<string, string>> {
  const urlByPath = new Map<string, string>();
  if (paths.length === 0) {
    return urlByPath;
  }

  const { data, error } = await supabase.storage
    .from(QUIZ_IMAGES_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_EXPIRY_SECONDS);

  if (error) {
    return urlByPath;
  }

  for (const entry of data ?? []) {
    if (entry.signedUrl && !entry.error && entry.path) {
      urlByPath.set(entry.path, entry.signedUrl);
    }
  }

  return urlByPath;
}

/**
 * Best-effort cleanup - never throws, so a Storage hiccup never blocks a
 * quiz save/delete that has already succeeded in Postgres.
 */
export async function deleteQuizImages(
  supabase: SupabaseClient,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) {
    return;
  }

  try {
    await supabase.storage.from(QUIZ_IMAGES_BUCKET).remove(paths);
  } catch {
    // Orphaned Storage object, not a correctness issue - nothing references it.
  }
}
