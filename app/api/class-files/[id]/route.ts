import { createClient } from "@/lib/supabase/server";
import { CLASS_FILES_BUCKET } from "@/lib/class-files";

export const dynamic = "force-dynamic";

// A signed URL lives just long enough to start the download; the portal
// link itself (/api/class-files/<id>) never expires but needs a login.
const SIGNED_URL_SECONDS = 60;

/**
 * Opens a class file: checks the signed-in user may see it (row-level
 * security on class_files - the teacher, or a student/parent of the
 * class) and redirects to a short-lived signed URL, or to the link for a
 * posted link. Anyone else gets a 404, whether or not the file exists.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: file } = await supabase
    .from("class_files")
    .select("kind, storage_path, file_name, url")
    .eq("id", id)
    .maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });

  if (file.kind === "link" && file.url) {
    return Response.redirect(file.url, 302);
  }
  if (!file.storage_path) return new Response("Not found", { status: 404 });

  // ?download=1 saves the file under its name; otherwise it opens in the
  // browser's PDF viewer.
  const download = new URL(request.url).searchParams.get("download") === "1";
  const { data: signed, error } = await supabase.storage
    .from(CLASS_FILES_BUCKET)
    .createSignedUrl(
      file.storage_path,
      SIGNED_URL_SECONDS,
      download ? { download: file.file_name ?? true } : undefined,
    );
  if (error || !signed?.signedUrl) return new Response("Not found", { status: 404 });

  return Response.redirect(signed.signedUrl, 302);
}
