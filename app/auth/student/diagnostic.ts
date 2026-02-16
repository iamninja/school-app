"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Student } from "@/lib/types/database";

interface DiagnosticSuccess {
  students: Pick<
    Student,
    "id" | "first_name" | "last_name" | "email" | "user_id"
  >[];
  count: number;
}

interface DiagnosticError {
  error: string;
  details: unknown;
}

type DiagnosticResult = DiagnosticSuccess | DiagnosticError;

export async function diagnosticCheckAction(): Promise<DiagnosticResult> {
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
    students:
      (students as Pick<
        Student,
        "id" | "first_name" | "last_name" | "email" | "user_id"
      >[]) || [],
    count: students?.length || 0,
  };
}
