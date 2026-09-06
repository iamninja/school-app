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
  "Αυτό το email είναι ήδη εγγεγραμμένο. Παρακαλώ συνδεθείτε.";

const ROLE_LABELS_EL: Record<"student" | "parent", string> = {
  student: "μαθητής",
  parent: "γονέας",
};

// `%`/`_` are valid characters in an email local-part but are also
// Postgres ILIKE wildcards, and `\` is ILIKE's default escape character -
// left unescaped, a caller could pass e.g. "a%" and pattern-match/enumerate
// the whole roster by prefix instead of looking up one specific address.
// Escaping them (Postgres' default ILIKE escape char is backslash) keeps
// the intentional case-insensitive match while forcing every character in
// the input to be treated as a literal.
export function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

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
      error: "Σφάλμα διαμόρφωσης διακομιστή. Παρακαλώ επικοινωνήστε μαζί μας.",
    };
  }

  const supabase = createServiceRoleClient();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: row, error } = await supabase
    .from(params.table)
    .select(params.columns)
    .ilike("email", escapeIlikePattern(normalizedEmail))
    .single<TRow>();

  if (error || !row) {
    if (error) {
      console.error(`Database error checking ${params.role} email:`, error);
    }
    return { exists: false, error: params.notFoundError };
  }

  if (row.user_id) {
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
    return { error: "Αποτυχία δημιουργίας λογαριασμού" };
  }

  const { error: updateError } = await supabaseAdmin
    .from(params.table)
    .update({ user_id: authData.user.id })
    .eq("email", params.email)
    .eq("id", params.recordId);

  if (updateError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return {
      error: `Αποτυχία σύνδεσης λογαριασμού ${ROLE_LABELS_EL[params.role]}`,
    };
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
    return { error: "Η ταυτοποίηση απέτυχε" };
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
    return {
      error: `Αυτός ο λογαριασμός δεν είναι εγγεγραμμένος ως ${ROLE_LABELS_EL[params.role]}`,
    };
  }

  return redirect(params.redirectTo);
}
