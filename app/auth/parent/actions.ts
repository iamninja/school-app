"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type {
  ParentEmailCheckResult,
  ParentDashboardData,
  StudentClassAssignmentWithClass,
  ClassScheduleSlot,
  AttendanceRecord,
  ActionResult,
  QuizSummary,
} from "@/lib/types/database";

/**
 * Check if an email exists in the student_parents table and is not already registered
 */
export async function checkParentEmailAction(
  email: string,
): Promise<ParentEmailCheckResult> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
    return {
      exists: false,
      error: "Server configuration error. Please contact support.",
    };
  }

  const supabase = createServiceRoleClient();
  const normalizedEmail = email.trim().toLowerCase();

  console.log("Checking parent email (normalized):", normalizedEmail);

  const { data: parent, error } = await supabase
    .from("student_parents")
    .select("id, user_id, name, email, student_id")
    .ilike("email", normalizedEmail)
    .single();

  if (error) {
    console.error("Database error checking parent email:", error);
    return {
      exists: false,
      error:
        "No parent found with this email. Please contact your child's teacher.",
    };
  }

  if (!parent) {
    console.log("No parent found with email:", normalizedEmail);
    return {
      exists: false,
      error:
        "No parent found with this email. Please contact your child's teacher.",
    };
  }

  if (parent.user_id) {
    console.log("Email already has user_id:", parent.user_id);
    return {
      exists: false,
      error: "This email is already registered. Please login instead.",
    };
  }

  console.log("Parent found:", parent.name);
  return {
    exists: true,
    parentId: parent.id,
    parentName: parent.name,
    studentId: parent.student_id,
  };
}

/**
 * Sign up a parent - creates auth user and links to existing parent record
 */
export async function signUpParentAction(data: {
  email: string;
  password: string;
}): Promise<ActionResult> {
  const supabaseAdmin = createServiceRoleClient();

  const emailCheck = await checkParentEmailAction(data.email);
  if (!emailCheck.exists) {
    return { error: emailCheck.error };
  }

  const { data: authData, error: signUpError } =
    await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        role: "parent",
      },
    });

  if (signUpError) {
    return { error: signUpError.message };
  }

  if (!authData.user) {
    return { error: "Failed to create user account" };
  }

  const { error: updateError } = await supabaseAdmin
    .from("student_parents")
    .update({ user_id: authData.user.id })
    .eq("email", data.email)
    .eq("id", emailCheck.parentId);

  if (updateError) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
    return { error: "Failed to link parent account" };
  }

  return { success: true };
}

/**
 * Sign in a parent
 */
export async function signInParentAction(data: {
  email: string;
  password: string;
}): Promise<ActionResult | never> {
  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  });

  if (error) {
    return { error: error.message };
  }

  if (!authData.user) {
    return { error: "Authentication failed" };
  }

  // Use service role client to verify parent record (bypasses RLS to avoid recursion)
  const supabaseAdmin = createServiceRoleClient();
  const { data: parent, error: parentError } = await supabaseAdmin
    .from("student_parents")
    .select("id")
    .eq("user_id", authData.user.id)
    .single();

  if (parentError || !parent) {
    console.error("Parent verification failed:", parentError);
    await supabase.auth.signOut();
    return { error: "This account is not registered as a parent" };
  }

  return redirect("/parent-dashboard");
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
    .from("student_parents")
    .select("id, name, email, phone, is_primary, student_id")
    .eq("user_id", user.id)
    .single();

  if (parentError || !parent) {
    return { success: false, error: "Parent record not found" };
  }

  // Use service role to get all parents for the student (to show other parent contacts)
  const { data: allParents } = await supabaseAdmin
    .from("student_parents")
    .select("name, email, phone, is_primary")
    .eq("student_id", parent.student_id)
    .order("is_primary", { ascending: false });

  // Use service role for student data (avoids RLS recursion)
  const { data: student, error: studentError } = await supabaseAdmin
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
    .eq("id", parent.student_id)
    .single();

  if (studentError || !student) {
    console.error("Student query error:", studentError);
    return { success: false, error: "Student record not found" };
  }

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
      (classAssignments as StudentClassAssignmentWithClass[] | null ?? []).map(
        (a) => [a.class_id, a.classes.name],
      ),
    );

    const { data: assignmentRows } = await supabaseAdmin
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
    success: true,
    data: {
      parent: {
        id: parent.id,
        name: parent.name,
        email: parent.email,
        phone: parent.phone,
        isPrimary: parent.is_primary,
      },
      student: {
        id: student.id,
        firstName: student.first_name,
        lastName: student.last_name,
        gradeLevel: student.grade_level,
        email: student.email,
        tuitionAmount: student.tuition_amount,
        tuitionStatus: student.tuition_status,
      },
      allParents: allParents || [],
      classes:
        (classAssignments as StudentClassAssignmentWithClass[] | null)?.map(
          (a) => ({
            id: a.classes.id,
            name: a.classes.name,
            hoursPerWeek: a.classes.hours_per_week,
          }),
        ) || [],
      schedules: schedules,
      attendance: (attendance as AttendanceRecord[] | null) || [],
      quizzes,
    },
  };
}
