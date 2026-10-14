import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The companion's page guard - same rules as the console page
 * (app/protected/teacher/page.tsx): signed out → teacher login, signed in
 * but not a teacher → home. Cached per request, so the layout and the page
 * share one check.
 */
export const requireCompanionTeacher = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/teacher-login");
  }

  const { data: teacherRow } = await supabase
    .from("teachers")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!teacherRow) {
    redirect("/");
  }

  return { supabase, teacherId: user.id };
});

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** A `?date=` value if it's a real YYYY-MM-DD date, otherwise null. */
export function parseDateParam(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
    ? value
    : null;
}
