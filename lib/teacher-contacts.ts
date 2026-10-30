import { normalizeGreekPhone } from "@/lib/teacher-app/phone";

// People outside the school the teacher tags with "+" in a task (a supplier,
// the accountant) - supabase/migrations/*_anytime-tasks-and-contacts.sql.
// Managed on the console's Business tab; on Android they can be picked from
// the phone's own contacts. Pure - shared by the server actions and the UI.

export interface TeacherContact {
  id: string;
  name: string;
  /** "Supplier", "Accountant" … */
  label: string | null;
  /** E.164. */
  phone: string | null;
  email: string | null;
  created_at: string;
}

export const TEACHER_CONTACT_COLUMNS = "id, name, label, phone, email, created_at";

export interface TeacherContactInput {
  name: string;
  label?: string | null;
  phone?: string | null;
  email?: string | null;
}

export const CONTACT_NAME_MAX_LENGTH = 120;
export const CONTACT_LABEL_MAX_LENGTH = 60;

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * A written number as E.164 (lib/teacher-app/phone.ts): a Greek one the
 * usual way (69…, 21…, with or without +30), any other with its "+" or "00"
 * country prefix. Null when it isn't a number the table accepts.
 */
export function normalizeContactPhone(value: string | null | undefined): string | null {
  const e164 = normalizeGreekPhone(value);
  return e164 && /^\+[1-9][0-9]{6,14}$/.test(e164) ? e164 : null;
}

export type CleanContact =
  | { ok: true; row: { name: string; label: string | null; phone: string | null; email: string | null } }
  | { ok: false; error: string };

/** Checks and tidies a contact before it is saved - same rules as the table's checks. */
export function cleanContact(input: TeacherContactInput): CleanContact {
  const name = input.name.replace(/\s+/g, " ").trim();
  if (!name) return { ok: false, error: "Give the contact a name" };
  if (name.length > CONTACT_NAME_MAX_LENGTH) {
    return { ok: false, error: `Keep the name under ${CONTACT_NAME_MAX_LENGTH} characters` };
  }
  const label = input.label?.trim() || null;
  if (label && label.length > CONTACT_LABEL_MAX_LENGTH) {
    return { ok: false, error: `Keep the label under ${CONTACT_LABEL_MAX_LENGTH} characters` };
  }
  const phone = input.phone?.trim() ? normalizeContactPhone(input.phone) : null;
  if (input.phone?.trim() && !phone) {
    return { ok: false, error: "That phone number doesn't look right" };
  }
  const email = input.email?.trim() || null;
  if (email && (email.length > 254 || !EMAIL.test(email))) {
    return { ok: false, error: "That email address doesn't look right" };
  }
  return { ok: true, row: { name, label, phone, email } };
}
