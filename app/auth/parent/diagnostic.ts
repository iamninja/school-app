"use server";

import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Diagnostic tool to check parent registration status
 * This helps debug why a parent can't log in
 */
export async function diagnoseParentAccountAction(email: string) {
  const supabase = createServiceRoleClient();
  const normalizedEmail = email.trim().toLowerCase();

  console.log("=== PARENT ACCOUNT DIAGNOSTIC ===");
  console.log("Email (normalized):", normalizedEmail);

  // Check if email exists in student_parents table
  const { data: parentRecords, error: parentError } = await supabase
    .from("student_parents")
    .select("*")
    .ilike("email", normalizedEmail);

  if (parentError) {
    console.error("Error querying student_parents:", parentError);
    return {
      status: "error",
      message: "Database error",
      details: parentError.message,
    };
  }

  if (!parentRecords || parentRecords.length === 0) {
    console.log("❌ No parent record found with this email");
    return {
      status: "not_found",
      message: "No parent record found in database",
      suggestion:
        "Ask your child's teacher to add your email as a parent in the system",
    };
  }

  console.log(
    `✓ Found ${parentRecords.length} parent record(s):`,
    parentRecords,
  );

  // Check if any of these parents have a user_id
  const parentWithUser = parentRecords.find((p) => p.user_id);

  if (!parentWithUser) {
    console.log("✓ Parent email exists but no user_id set");
    console.log("→ This parent needs to SIGN UP (not login)");
    return {
      status: "not_registered",
      message: "Parent record exists but account not created yet",
      suggestion: "Use the Parent Sign Up page to create your account",
      parentRecord: parentRecords[0],
    };
  }

  // Check if the auth user exists
  const { data: authUser, error: authError } =
    await supabase.auth.admin.getUserById(parentWithUser.user_id);

  if (authError || !authUser.user) {
    console.log("❌ user_id exists but auth user not found");
    console.log("→ Orphaned user_id, consider resetting");
    return {
      status: "orphaned",
      message: "Parent record has user_id but auth user doesn't exist",
      suggestion: "Contact support - the account is in an invalid state",
      parentRecord: parentWithUser,
    };
  }

  console.log("✓ Auth user exists:", authUser.user.email);

  if (authUser.user.email?.toLowerCase() !== normalizedEmail) {
    console.log("⚠️ Email mismatch!");
    console.log("  Parent record email:", normalizedEmail);
    console.log("  Auth user email:", authUser.user.email);
    return {
      status: "mismatch",
      message: "Email mismatch between parent record and auth user",
      parentRecord: parentWithUser,
      authUser: authUser.user,
    };
  }

  console.log("✓ Everything looks good!");
  return {
    status: "valid",
    message: "Parent account is properly configured",
    suggestion: "You should be able to login",
    parentRecord: parentWithUser,
    authUser: {
      id: authUser.user.id,
      email: authUser.user.email,
      created_at: authUser.user.created_at,
    },
  };
}
