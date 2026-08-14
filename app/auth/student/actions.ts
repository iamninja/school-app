"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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
  // Verify service role key is configured
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
    return {
      exists: false,
      error: "Server configuration error. Please contact support.",
    };
  }

  // Use service role client to bypass RLS - user isn't authenticated yet
  const supabase = createServiceRoleClient();

  // Normalize email (trim whitespace and lowercase)
  const normalizedEmail = email.trim().toLowerCase();

  console.log("Checking email (normalized):", normalizedEmail);

  const { data: student, error } = await supabase
    .from("students")
    .select("id, user_id, first_name, last_name, email")
    .ilike("email", normalizedEmail)
    .single();

  if (error) {
    console.error("Database error checking student email:", error);
    return {
      exists: false,
      error: "No student found with this email. Please contact your teacher.",
    };
  }

  if (!student) {
    console.log("No student found with email:", normalizedEmail);
    return {
      exists: false,
      error: "No student found with this email. Please contact your teacher.",
    };
  }

  if (student.user_id) {
    console.log("Email already has user_id:", student.user_id);
    return {
      exists: false,
      error: "This email is already registered. Please login instead.",
    };
  }

  console.log("Student found:", student.first_name, student.last_name);
  return {
    exists: true,
    studentId: student.id,
    firstName: student.first_name,
    lastName: student.last_name,
  };
}

/**
 * Sign up a student - creates auth user and links to existing student record
 */
export async function signUpStudentAction(data: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const supabaseAdmin = createServiceRoleClient();

  // First verify the email exists in students table and is not already registered
  const emailCheck = await checkStudentEmailAction(data.email);
  if (!emailCheck.exists) {
    return { error: emailCheck.error };
  }

  // Create the auth user with email already confirmed (bypasses confirmation email)
  const { data: authData, error: signUpError } =
    await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        role: "student",
      },
    });

  if (signUpError) {
    return { error: signUpError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create user account" };
  }

  // Link the auth user to the student record using admin client (bypasses RLS)
  const { error: updateError } = await supabaseAdmin
    .from("students")
    .update({ user_id: authData.user.id })
    .eq("email", data.email)
    .eq("id", emailCheck.studentId);

  if (updateError) {
    // If linking fails, delete the auth user
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return { error: "Failed to link student account" };
  }

  return { success: true };
}

/**
 * Sign in a student
 */
export async function signInStudentAction(data: {
  email: string;
  password: string;
}): Promise<ActionResult | never> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (error) {
    return { error: error.message };
  }

  // Verify this user is linked to a student
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", (await supabase.auth.getUser()).data.user?.id)
    .single();

  if (!student) {
    await supabase.auth.signOut();
    return { error: "This account is not registered as a student" };
  }

  return redirect("/student-dashboard");
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
      tuition_status
    `,
    )
    .eq("user_id", user.id)
    .single();

  if (studentError || !student) {
    return redirect("/auth/student-login");
  }

  // Get parent info
  const { data: parents } = await supabase
    .from("student_parents")
    .select("name, email, phone, is_primary")
    .eq("student_id", student.id)
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
        hours_per_week
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

  // Get quizzes for assigned classes, plus this student's own attempts
  let quizzes: QuizSummary[] = [];
  if (classIds.length > 0) {
    const { data: quizRows } = await supabase
      .from("quizzes")
      .select("id, title, class_id, classes:class_id (name)")
      .in("class_id", classIds);

    const quizIds = (quizRows ?? []).map((quiz) => quiz.id);

    if (quizIds.length > 0) {
      const [{ data: attempts }, { data: questions }] = await Promise.all([
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
        const quizClass = quiz.classes as unknown as { name: string } | null;
        const attempt = attemptByQuiz.get(quiz.id);

        return {
          id: quiz.id,
          title: quiz.title,
          classId: quiz.class_id,
          className: quizClass?.name ?? "",
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
        }),
      ) || [],
    schedules: (schedules as ClassScheduleSlot[] | null) || [],
    attendance: (attendance as AttendanceRecord[] | null) || [],
    quizzes,
  };
}
