"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  ParentEmailCheckResult,
  ParentDashboardData,
  ParentDashboardChild,
  StudentClassAssignmentWithClass,
  ClassScheduleSlot,
  AttendanceRecord,
  ActionResult,
  QuizSummary,
} from "@/lib/types/database";
import {
  createRoleAuthUser,
  lookupRoleEmail,
  signInAsRole,
} from "@/lib/auth/role-account-actions";

/**
 * Check if an email exists in the family_parents table and is not already registered
 */
export async function checkParentEmailAction(
  email: string,
): Promise<ParentEmailCheckResult> {
  return lookupRoleEmail(email, {
    role: "parent",
    table: "family_parents",
    columns: "id, user_id, name, email, family_id",
    notFoundError:
      "No parent found with this email. Please contact your child's teacher.",
    toSuccess: (row: {
      id: string;
      user_id: string | null;
      name: string | null;
      family_id: string;
    }) => ({
      parentId: row.id,
      parentName: row.name,
      familyId: row.family_id,
    }),
  });
}

/**
 * Sign up a parent - creates auth user and links to existing parent record
 */
export async function signUpParentAction(data: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const emailCheck = await checkParentEmailAction(data.email);
  if (!emailCheck.exists) {
    return { error: emailCheck.error };
  }

  return createRoleAuthUser({
    role: "parent",
    table: "family_parents",
    recordId: emailCheck.parentId,
    email: data.email,
    password: data.password,
  });
}

/**
 * Sign in a parent
 */
export async function signInParentAction(data: {
  email: string;
  password: string;
}): Promise<ActionResult | never> {
  return signInAsRole({
    role: "parent",
    table: "family_parents",
    email: data.email,
    password: data.password,
    useServiceRoleForVerification: true,
    redirectTo: "/parent-dashboard",
  });
}

/**
 * Get parent dashboard data
 */
export async function getParentDashboardDataAction(): Promise<
  ActionResult<ParentDashboardData>
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: "Not authenticated" };
  }

  // Use service role to get parent record (avoids RLS recursion)
  const supabaseAdmin = createServiceRoleClient();
  const { data: parent, error: parentError } = await supabaseAdmin
    .from("family_parents")
    .select("id, name, email, phone, is_primary, family_id")
    .eq("user_id", user.id)
    .single();

  if (parentError || !parent) {
    return { success: false, error: "Parent record not found" };
  }

  // Use service role to get all parents for the family (to show other parent contacts)
  const { data: allParents } = await supabaseAdmin
    .from("family_parents")
    .select("name, email, phone, is_primary")
    .eq("family_id", parent.family_id)
    .order("is_primary", { ascending: false });

  // Use service role for every non-withdrawn child in this family (avoids
  // RLS recursion) - hidden by default, matching the teacher dashboard's
  // "hidden unless toggled" withdrawn-student behavior.
  const { data: studentRows, error: studentsError } = await supabaseAdmin
    .from("students")
    .select(
      `
      id,
      first_name,
      last_name,
      grade_level,
      email,
      tuition_amount,
      tuition_status,
      withdrawn_at
    `,
    )
    .eq("family_id", parent.family_id)
    .is("withdrawn_at", null);

  if (studentsError || !studentRows || studentRows.length === 0) {
    console.error("Student query error:", studentsError);
    return { success: false, error: "No student records found for this family" };
  }

  const children: ParentDashboardChild[] = await Promise.all(
    studentRows.map(async (student) => {
      // Use service role for class assignments (avoids RLS recursion)
      const { data: classAssignments } = await supabaseAdmin
        .from("student_class_assignments")
        .select(
          `
          class_id,
          classes:class_id (
            id,
            name,
            hours_per_week
          )
        `,
        )
        .eq("student_id", student.id);
      const classIds =
        (classAssignments as StudentClassAssignmentWithClass[] | null)
          ?.map((a) => a.class_id)
          .filter(Boolean) || [];

      // Use service role for schedules (avoids RLS recursion)
      let schedules: ClassScheduleSlot[] = [];
      if (classIds.length > 0) {
        const { data } = await supabaseAdmin
          .from("class_schedule_slots")
          .select("class_id, day, time")
          .in("class_id", classIds);
        schedules = (data as ClassScheduleSlot[] | null) || [];
      }

      // Use service role for attendance (avoids RLS recursion)
      const { data: attendance } = await supabaseAdmin
        .from("attendance_records")
        .select("class_id, attendance_date, status")
        .eq("student_id", student.id)
        .order("attendance_date", { ascending: false })
        .limit(50);

      // Use service role for quizzes + this child's attempts (avoids RLS recursion)
      let quizzes: QuizSummary[] = [];
      if (classIds.length > 0) {
        const classNameById = new Map(
          (
            classAssignments as StudentClassAssignmentWithClass[] | null ?? []
          ).map((a) => [a.class_id, a.classes.name]),
        );

        const { data: assignmentRows } = await supabaseAdmin
          .from("quiz_assignments")
          .select("quiz_id, class_id")
          .in("class_id", classIds);

        const quizIds = [
          ...new Set((assignmentRows ?? []).map((a) => a.quiz_id)),
        ];
        const classNamesByQuiz = new Map<string, string[]>();
        for (const row of assignmentRows ?? []) {
          const list = classNamesByQuiz.get(row.quiz_id) ?? [];
          list.push(classNameById.get(row.class_id) ?? "");
          classNamesByQuiz.set(row.quiz_id, list);
        }

        if (quizIds.length > 0) {
          const [{ data: quizRows }, { data: attempts }, { data: questions }] =
            await Promise.all([
              supabaseAdmin.from("quizzes").select("id, title").in("id", quizIds),
              supabaseAdmin
                .from("quiz_attempts")
                .select("quiz_id, score, submitted_at")
                .eq("student_id", student.id)
                .in("quiz_id", quizIds),
              supabaseAdmin
                .from("quiz_questions")
                .select("quiz_id, points")
                .in("quiz_id", quizIds),
            ]);

          const attemptByQuiz = new Map(
            (attempts ?? []).map((attempt) => [attempt.quiz_id, attempt]),
          );
          const maxScoreByQuiz = new Map<string, number>();
          for (const question of questions ?? []) {
            maxScoreByQuiz.set(
              question.quiz_id,
              (maxScoreByQuiz.get(question.quiz_id) ?? 0) + question.points,
            );
          }

          quizzes = (quizRows ?? []).map((quiz) => {
            const attempt = attemptByQuiz.get(quiz.id);

            return {
              id: quiz.id,
              title: quiz.title,
              className: (classNamesByQuiz.get(quiz.id) ?? []).join(", "),
              completed: Boolean(attempt),
              score: attempt?.score ?? null,
              maxScore: maxScoreByQuiz.get(quiz.id) ?? 0,
              submittedAt: attempt?.submitted_at ?? null,
            };
          });
        }
      }

      return {
        student: {
          id: student.id,
          firstName: student.first_name,
          lastName: student.last_name,
          gradeLevel: student.grade_level,
          email: student.email,
          tuitionAmount: student.tuition_amount,
          tuitionStatus: student.tuition_status,
          withdrawnAt: student.withdrawn_at,
        },
        classes:
          (classAssignments as StudentClassAssignmentWithClass[] | null)?.map(
            (a) => ({
              id: a.classes.id,
              name: a.classes.name,
              hoursPerWeek: a.classes.hours_per_week,
            }),
          ) || [],
        schedules,
        attendance: (attendance as AttendanceRecord[] | null) || [],
        quizzes,
      };
    }),
  );

  return {
    success: true,
    data: {
      parent: {
        id: parent.id,
        name: parent.name,
        email: parent.email,
        phone: parent.phone,
        isPrimary: parent.is_primary,
      },
      allParents: allParents || [],
      kids: children,
    },
  };
}
