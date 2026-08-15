"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";

type DiagnosticStatus =
  | "error"
  | "not_found"
  | "not_registered"
  | "orphaned"
  | "mismatch"
  | "valid";

/**
 * Deliberately PII-free: this is called unauthenticated (a parent who can't
 * log in has no session yet), so the response must never contain a name,
 * email, phone, or any id - only enough to point the parent at the right
 * next step. Internally it still needs the full record to make that call.
 */
export interface DiagnosticResult {
  status: DiagnosticStatus;
  message: string;
  suggestion?: string;
}

/**
 * Diagnostic tool to check parent registration status
 * This helps a parent self-diagnose why they can't log in
 */
export async function diagnoseParentAccountAction(
  email: string,
): Promise<DiagnosticResult> {
  const supabase = createServiceRoleClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: parentRecords, error: parentError } = await supabase
    .from("student_parents")
    .select("id, user_id")
    .ilike("email", normalizedEmail);

  if (parentError) {
    console.error("Error querying student_parents:", parentError);
    return {
      status: "error",
      message: "Something went wrong checking that email. Please try again.",
    };
  }

  if (!parentRecords || parentRecords.length === 0) {
    return {
      status: "not_found",
      message: "No parent record found in database",
      suggestion:
        "Ask your child's teacher to add your email as a parent in the system",
    };
  }

  const parentWithUser = parentRecords.find((p) => p.user_id);

  if (!parentWithUser || !parentWithUser.user_id) {
    return {
      status: "not_registered",
      message: "Parent record exists but account not created yet",
      suggestion: "Use the Parent Sign Up page to create your account",
    };
  }

  const { data: authUser, error: authError } =
    await supabase.auth.admin.getUserById(parentWithUser.user_id);

  if (authError || !authUser.user) {
    console.error("Orphaned parent user_id:", parentWithUser.user_id);
    return {
      status: "orphaned",
      message: "Parent record has user_id but auth user doesn't exist",
      suggestion: "Contact support - the account is in an invalid state",
    };
  }

  if (authUser.user.email?.toLowerCase() !== normalizedEmail) {
    console.error(
      "Parent email mismatch for user_id:",
      parentWithUser.user_id,
    );
    return {
      status: "mismatch",
      message: "Email mismatch between parent record and auth user",
      suggestion: "Contact support - the account is in an invalid state",
    };
  }

  return {
    status: "valid",
    message: "Parent account is properly configured",
    suggestion: "You should be able to login",
  };
}
