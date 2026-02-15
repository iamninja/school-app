"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";

export async function diagnosticCheckAction() {
  const supabase = createServiceRoleClient();

  // Check if students table has user_id column
  const { data: students, error } = await supabase
    .from("students")
    .select("id, first_name, last_name, email, user_id")
    .limit(10);

  if (error) {
    return {
      error: error.message,
      details: error,
    };
  }

  return {
    students,
    count: students?.length || 0,
  };
}
