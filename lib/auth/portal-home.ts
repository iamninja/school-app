import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const TEACHER_HOME = "/protected/teacher";
export const PARENT_HOME = "/parent-dashboard";
export const STUDENT_HOME = "/student-dashboard";
export const SIGNED_OUT_HOME = "/";

/**
 * Where a signed-in user belongs: the installed app opens at /start, which
 * sends each person to their own portal (the same three tables the role
 * sign-in flows check - see lib/auth/role-account-actions.ts and
 * lib/auth/require-teacher.ts). A user with no matching role row lands on
 * the public home page, which is also where signed-out visitors go.
 *
 * Priority teacher > parent > student, so an account that is somehow in more
 * than one table always gets the broadest view.
 */
export async function resolvePortalHome(
  supabase: SupabaseServerClient,
  userId: string | null | undefined,
): Promise<string> {
  if (!userId) {
    return SIGNED_OUT_HOME;
  }

  const [{ data: teacher }, { data: parent }, { data: student }] =
    await Promise.all([
      supabase
        .from("teachers")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("family_parents")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("students")
        .select("id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle(),
    ]);

  if (teacher) return TEACHER_HOME;
  if (parent) return PARENT_HOME;
  if (student) return STUDENT_HOME;
  return SIGNED_OUT_HOME;
}
