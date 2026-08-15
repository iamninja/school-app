import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Throws if the given user isn't in the teachers table. Call this right
 * after the existing `if (!user) throw new Error("Not authenticated")`
 * check in every teacher-only server action - being logged in is not the
 * same as being the teacher.
 */
export async function requireTeacher(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<void> {
  const { data: teacher } = await supabase
    .from("teachers")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!teacher) {
    throw new Error("Not authorized as a teacher");
  }
}
