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
    .from("family_parents")
    .select("id, user_id")
    .ilike("email", normalizedEmail);

  if (parentError) {
    console.error("Error querying family_parents:", parentError);
    return {
      status: "error",
      message: "Κάτι πήγε στραβά κατά τον έλεγχο του email. Δοκιμάστε ξανά.",
    };
  }

  if (!parentRecords || parentRecords.length === 0) {
    return {
      status: "not_found",
      message: "Δεν βρέθηκε γονέας στη βάση δεδομένων",
      suggestion:
        "Ζητήστε από τον καθηγητή του παιδιού σας να προσθέσει το email σας ως γονέα στο σύστημα",
    };
  }

  const parentWithUser = parentRecords.find((p) => p.user_id);

  if (!parentWithUser || !parentWithUser.user_id) {
    return {
      status: "not_registered",
      message: "Ο γονέας υπάρχει στο σύστημα αλλά ο λογαριασμός δεν έχει δημιουργηθεί ακόμα",
      suggestion: "Χρησιμοποιήστε τη σελίδα εγγραφής γονέα για να δημιουργήσετε τον λογαριασμό σας",
    };
  }

  const { data: authUser, error: authError } =
    await supabase.auth.admin.getUserById(parentWithUser.user_id);

  if (authError || !authUser.user) {
    console.error("Orphaned parent user_id:", parentWithUser.user_id);
    return {
      status: "orphaned",
      message: "Ο γονέας έχει user_id αλλά δεν υπάρχει αντίστοιχος λογαριασμός",
      suggestion: "Επικοινωνήστε μαζί μας - ο λογαριασμός βρίσκεται σε μη έγκυρη κατάσταση",
    };
  }

  if (authUser.user.email?.toLowerCase() !== normalizedEmail) {
    console.error(
      "Parent email mismatch for user_id:",
      parentWithUser.user_id,
    );
    return {
      status: "mismatch",
      message: "Ασυμφωνία email μεταξύ του γονέα και του λογαριασμού",
      suggestion: "Επικοινωνήστε μαζί μας - ο λογαριασμός βρίσκεται σε μη έγκυρη κατάσταση",
    };
  }

  return {
    status: "valid",
    message: "Ο λογαριασμός γονέα είναι σωστά διαμορφωμένος",
    suggestion: "Θα πρέπει να μπορείτε να συνδεθείτε",
  };
}
