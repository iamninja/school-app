"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import {
  createRoleAuthUser,
  lookupRoleEmail,
  signInAsRole,
} from "@/lib/auth/role-account-actions";
import type {
  StudentEmailCheckResult,
  StudentDashboardData,
  StudentClassAssignmentWithClass,
  ClassScheduleSlot,
  AttendanceRecord,
  ActionResult,
  QuizSummary,
} from "@/lib/types/database";

/**
 * Check if an email exists in the students table and is not already registered
 * Uses service role client to bypass RLS since user is not authenticated during signup
 */
export async function checkStudentEmailAction(
  email: string,
): Promise<StudentEmailCheckResult> {
  return lookupRoleEmail(email, {
    role: "student",
    table: "students",
    columns: "id, user_id, first_name, last_name, email",
    notFoundError:
      "Δεν βρέθηκε μαθητής με αυτό το email. Επικοινωνήστε με τον καθηγητή σας.",
    toSuccess: (row: {
      id: string;
      user_id: string | null;
      first_name: string;
      last_name: string;
    }) => ({
      studentId: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
    }),
  });
}

/**
 * Sign up a student - creates auth user and links to existing student record
 */
export async function signUpStudentAction(data: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const emailCheck = await checkStudentEmailAction(data.email);
  if (!emailCheck.exists) {
    return { error: emailCheck.error };
  }

  return createRoleAuthUser({
    role: "student",
    table: "students",
    recordId: emailCheck.studentId,
    email: data.email,
    password: data.password,
  });
}

/**
 * Sign in a student
 */
export async function signInStudentAction(data: {
  email: string;
  password: string;
}): Promise<ActionResult | never> {
  return signInAsRole({
    role: "student",
    table: "students",
    email: data.email,
    password: data.password,
    useServiceRoleForVerification: false,
    redirectTo: "/student-dashboard",
  });
}

/**
 * Get student dashboard data
 */
export async function getStudentDashboardDataAction(): Promise<
  StudentDashboardData | never
> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return redirect("/auth/student-login");
  }

  // Get student info
  const { data: student, error: studentError } = await supabase
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
      family_id
    `,
    )
    .eq("user_id", user.id)
    .single();

  if (studentError || !student) {
    return redirect("/auth/student-login");
  }

  // Get parent info
  const { data: parents } = await supabase
    .from("family_parents")
    .select("name, email, phone, is_primary")
    .eq("family_id", student.family_id)
    .order("is_primary", { ascending: false });

  // Get assigned classes
  const { data: classAssignments } = await supabase
    .from("student_class_assignments")
    .select(
      `
      class_id,
      classes:class_id (
        id,
        name,
        hours_per_week,
        archived_at
      )
    `,
    )
    .eq("student_id", student.id);

  // Get class schedules
  const classIds =
    (classAssignments as StudentClassAssignmentWithClass[] | null)
      ?.map((a) => a.class_id)
      .filter(Boolean) || [];
  const { data: schedules } = await supabase
    .from("class_schedule_slots")
    .select("class_id, day, time")
    .in("class_id", classIds);

  // Get attendance records
  const { data: attendance } = await supabase
    .from("attendance_records")
    .select("class_id, attendance_date, status")
    .eq("student_id", student.id)
    .order("attendance_date", { ascending: false })
    .limit(50);

  // Get quizzes assigned to this student's classes, plus their own attempts
  let quizzes: QuizSummary[] = [];
  if (classIds.length > 0) {
    const classNameById = new Map(
      (classAssignments as StudentClassAssignmentWithClass[] | null ?? []).map(
        (a) => [a.class_id, a.classes.name],
      ),
    );

    const { data: assignmentRows } = await supabase
      .from("quiz_assignments")
      .select("quiz_id, class_id")
      .in("class_id", classIds);

    const quizIds = [...new Set((assignmentRows ?? []).map((a) => a.quiz_id))];
    const classNamesByQuiz = new Map<string, string[]>();
    for (const row of assignmentRows ?? []) {
      const list = classNamesByQuiz.get(row.quiz_id) ?? [];
      list.push(classNameById.get(row.class_id) ?? "");
      classNamesByQuiz.set(row.quiz_id, list);
    }

    if (quizIds.length > 0) {
      const [{ data: quizRows }, { data: attempts }, { data: questions }] =
        await Promise.all([
          supabase.from("quizzes").select("id, title").in("id", quizIds),
          supabase
            .from("quiz_attempts")
            .select("quiz_id, score, submitted_at")
            .eq("student_id", student.id)
            .in("quiz_id", quizIds),
          supabase.from("quiz_questions").select("quiz_id, points").in(
            "quiz_id",
            quizIds,
          ),
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
    },
    parents: parents || [],
    classes:
      (classAssignments as StudentClassAssignmentWithClass[] | null)?.map(
        (a) => ({
          id: a.classes.id,
          name: a.classes.name,
          hoursPerWeek: a.classes.hours_per_week,
          archivedAt: a.classes.archived_at,
        }),
      ) || [],
    schedules: (schedules as ClassScheduleSlot[] | null) || [],
    attendance: (attendance as AttendanceRecord[] | null) || [],
    quizzes,
  };
}
