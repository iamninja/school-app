import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { ActionResult } from "@/lib/types/database";

/**
 * Shared implementation behind the student/parent check-email/sign-up/
 * sign-in server actions. Those two roles run the same three-step flow
 * against a different table (students vs student_parents) with a couple of
 * field-name and error-copy differences - this factors out the ~90%
 * identical Supabase calls. Not "use server" itself: only ever called from
 * within the actual "use server" action files, never invoked directly from
 * a client component.
 */

const ALREADY_REGISTERED_ERROR =
  "This email is already registered. Please login instead.";

type EmailLookupResult<TExtra extends object> =
  | ({ exists: true } & TExtra)
  | { exists: false; error: string };

export async function lookupRoleEmail<
  TRow extends { id: string; user_id: string | null },
  TExtra extends object,
>(
  email: string,
  params: {
    role: "student" | "parent";
    table: "students" | "family_parents";
    columns: string;
    notFoundError: string;
    toSuccess: (row: TRow) => TExtra;
  },
): Promise<EmailLookupResult<TExtra>> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
    return {
      exists: false,
      error: "Server configuration error. Please contact support.",
    };
  }

  const supabase = createServiceRoleClient();
  const normalizedEmail = email.trim().toLowerCase();

  console.log(`Checking ${params.role} email (normalized):`, normalizedEmail);

  const { data: row, error } = await supabase
    .from(params.table)
    .select(params.columns)
    .ilike("email", normalizedEmail)
    .single<TRow>();

  if (error || !row) {
    if (error) {
      console.error(`Database error checking ${params.role} email:`, error);
    } else {
      console.log(`No ${params.role} found with email:`, normalizedEmail);
    }
    return { exists: false, error: params.notFoundError };
  }

  if (row.user_id) {
    console.log(`${params.role} email already has user_id:`, row.user_id);
    return { exists: false, error: ALREADY_REGISTERED_ERROR };
  }

  return { exists: true, ...params.toSuccess(row) };
}

export async function createRoleAuthUser(params: {
  role: "student" | "parent";
  table: "students" | "family_parents";
  recordId: string;
  email: string;
  password: string;
}): Promise<ActionResult> {
  const supabaseAdmin = createServiceRoleClient();

  const { data: authData, error: signUpError } =
    await supabaseAdmin.auth.admin.createUser({
      email: params.email,
      password: params.password,
      email_confirm: true,
      user_metadata: { role: params.role },
    });

  if (signUpError) {
    return { error: signUpError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create user account" };
  }

  const { error: updateError } = await supabaseAdmin
    .from(params.table)
    .update({ user_id: authData.user.id })
    .eq("email", params.email)
    .eq("id", params.recordId);

  if (updateError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return { error: `Failed to link ${params.role} account` };
  }

  return { success: true };
}

export async function signInAsRole(params: {
  role: "student" | "parent";
  table: "students" | "family_parents";
  email: string;
  password: string;
  // true for parent - avoids RLS recursion, per supabase/parent-rls.sql
  useServiceRoleForVerification: boolean;
  redirectTo: string;
}): Promise<ActionResult | never> {
  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: params.email,
    password: params.password,
  });

  if (error) {
    return { error: error.message };
  }

  const userId = authData.user?.id;
  if (!userId) {
    return { error: "Authentication failed" };
  }

  const verifyClient = params.useServiceRoleForVerification
    ? createServiceRoleClient()
    : supabase;

  const { data: record, error: verifyError } = await verifyClient
    .from(params.table)
    .select("id")
    .eq("user_id", userId)
    .single();

  if (verifyError || !record) {
    console.error(`${params.role} verification failed:`, verifyError);
    await supabase.auth.signOut();
    return { error: `This account is not registered as a ${params.role}` };
  }

  return redirect(params.redirectTo);
}
