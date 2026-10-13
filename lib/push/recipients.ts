import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Who a notice goes to, as login user ids. Only people who can actually
 * sign in can receive anything: a student/parent with no login is skipped
 * (or, for students, replaced by their parents when parent fallback is on).
 * Withdrawn students and deleted families are always left out.
 *
 * Takes the client as an argument (the service-role client in production)
 * so it can be tested without a database.
 */
export type RecipientSpec =
  // School notices to a whole class.
  | { kind: "class_students"; classId: string }
  // School notices to specific students (a test's assigned students).
  | { kind: "students"; studentIds: string[] }
  // Absences: the student and their parents, both.
  | { kind: "student_and_parents"; studentId: string }
  // Money notices.
  | { kind: "family_parents"; familyIds: string[] }
  // Teacher alerts.
  | { kind: "teachers" }
  // Announcements.
  | { kind: "audience"; audience: "students" | "parents" | "both"; classId: string | null };

export type ResolvedRecipients = {
  students: string[];
  parents: string[];
  teachers: string[];
};

type StudentRow = {
  id: string;
  user_id: string | null;
  family_id: string;
  withdrawn_at: string | null;
  families: { deleted_at: string | null } | null;
};

const STUDENT_COLUMNS = "id, user_id, family_id, withdrawn_at, families(deleted_at)";

function isActive(student: StudentRow): boolean {
  return !student.withdrawn_at && !student.families?.deleted_at;
}

const unique = (values: (string | null | undefined)[]) =>
  [...new Set(values.filter((v): v is string => Boolean(v)))];

async function studentsOfClass(
  supabase: SupabaseClient,
  classId: string | null,
): Promise<StudentRow[]> {
  if (classId) {
    const { data } = await supabase
      .from("student_class_assignments")
      .select(`students!inner(${STUDENT_COLUMNS})`)
      .eq("class_id", classId);
    return ((data ?? []) as unknown as { students: StudentRow }[])
      .map((row) => row.students)
      .filter(isActive);
  }
  const { data } = await supabase.from("students").select(STUDENT_COLUMNS);
  return ((data ?? []) as unknown as StudentRow[]).filter(isActive);
}

async function studentsById(
  supabase: SupabaseClient,
  studentIds: string[],
): Promise<StudentRow[]> {
  if (studentIds.length === 0) return [];
  const { data } = await supabase
    .from("students")
    .select(STUDENT_COLUMNS)
    .in("id", studentIds);
  return ((data ?? []) as unknown as StudentRow[]).filter(isActive);
}

async function parentsOfFamilies(
  supabase: SupabaseClient,
  familyIds: string[],
): Promise<string[]> {
  if (familyIds.length === 0) return [];
  const { data } = await supabase
    .from("family_parents")
    .select("user_id, families(deleted_at)")
    .in("family_id", unique(familyIds));
  return unique(
    ((data ?? []) as unknown as {
      user_id: string | null;
      families: { deleted_at: string | null } | null;
    }[])
      .filter((row) => !row.families?.deleted_at)
      .map((row) => row.user_id),
  );
}

/**
 * School notices go to students; a student without a login is reached
 * through their parents instead when `parentFallback` is on.
 */
async function forStudents(
  supabase: SupabaseClient,
  students: StudentRow[],
  parentFallback: boolean,
): Promise<ResolvedRecipients> {
  const withoutLogin = students.filter((s) => !s.user_id);
  return {
    students: unique(students.map((s) => s.user_id)),
    parents: parentFallback
      ? await parentsOfFamilies(supabase, withoutLogin.map((s) => s.family_id))
      : [],
    teachers: [],
  };
}

export async function resolveRecipients(
  supabase: SupabaseClient,
  spec: RecipientSpec,
  { parentFallback }: { parentFallback: boolean },
): Promise<ResolvedRecipients> {
  switch (spec.kind) {
    case "class_students":
      return forStudents(
        supabase,
        await studentsOfClass(supabase, spec.classId),
        parentFallback,
      );
    case "students":
      return forStudents(
        supabase,
        await studentsById(supabase, spec.studentIds),
        parentFallback,
      );
    case "student_and_parents": {
      const [student] = await studentsById(supabase, [spec.studentId]);
      if (!student) return { students: [], parents: [], teachers: [] };
      return {
        students: unique([student.user_id]),
        parents: await parentsOfFamilies(supabase, [student.family_id]),
        teachers: [],
      };
    }
    case "family_parents":
      return {
        students: [],
        parents: await parentsOfFamilies(supabase, spec.familyIds),
        teachers: [],
      };
    case "teachers": {
      const { data } = await supabase.from("teachers").select("user_id");
      return {
        students: [],
        parents: [],
        teachers: unique((data ?? []).map((row: { user_id: string }) => row.user_id)),
      };
    }
    case "audience": {
      const students = await studentsOfClass(supabase, spec.classId);
      return {
        students:
          spec.audience === "parents" ? [] : unique(students.map((s) => s.user_id)),
        parents:
          spec.audience === "students"
            ? []
            : await parentsOfFamilies(supabase, students.map((s) => s.family_id)),
        teachers: [],
      };
    }
  }
}
