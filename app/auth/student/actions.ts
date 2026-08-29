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
  PortalCalendarEvent,
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
        archived_at,
        start_date,
        finish_date
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
    .select("class_id, class_name, attendance_date, status")
    .eq("student_id", student.id)
    .order("attendance_date", { ascending: false })
    .limit(300);

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
      .select("quiz_id, class_id, max_attempts")
      .in("class_id", classIds);

    const quizIds = [...new Set((assignmentRows ?? []).map((a) => a.quiz_id))];
    const classNamesByQuiz = new Map<string, string[]>();
    const maxAttemptsRowsByQuiz = new Map<string, (number | null)[]>();
    for (const row of assignmentRows ?? []) {
      const list = classNamesByQuiz.get(row.quiz_id) ?? [];
      list.push(classNameById.get(row.class_id) ?? "");
      classNamesByQuiz.set(row.quiz_id, list);

      const maxAttemptsList = maxAttemptsRowsByQuiz.get(row.quiz_id) ?? [];
      maxAttemptsList.push(row.max_attempts);
      maxAttemptsRowsByQuiz.set(row.quiz_id, maxAttemptsList);
    }
    // Most generous limit across every class this quiz is assigned to for
    // this student - null (unlimited) wins over any finite number,
    // mirroring is_quiz_shuffled_for_student's permissive-OR resolution.
    const maxAttemptsByQuiz = new Map<string, number | null>();
    for (const [quizId, rows] of maxAttemptsRowsByQuiz) {
      maxAttemptsByQuiz.set(
        quizId,
        rows.some((value) => value === null)
          ? null
          : Math.max(...(rows as number[])),
      );
    }

    if (quizIds.length > 0) {
      const [{ data: quizRows }, { data: attempts }, { data: questions }] =
        await Promise.all([
          supabase.from("quizzes").select("id, title").in("id", quizIds),
          supabase
            .from("quiz_attempts")
            .select("id, quiz_id, score, submitted_at")
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

      const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
      const { data: bestRows } =
        attemptIds.length > 0
          ? await supabase
              .from("quiz_attempt_bests")
              .select("attempt_id, score, attempts_used")
              .in("attempt_id", attemptIds)
          : { data: [] as { attempt_id: string; score: number; attempts_used: number }[] };
      const bestByAttempt = new Map(
        (bestRows ?? []).map((row) => [row.attempt_id, row]),
      );

      quizzes = (quizRows ?? []).map((quiz) => {
        const attempt = attemptByQuiz.get(quiz.id);
        const best = attempt ? bestByAttempt.get(attempt.id) : undefined;
        const maxAttempts = maxAttemptsByQuiz.get(quiz.id) ?? null;
        const attemptsUsed = best?.attempts_used ?? (attempt ? 1 : 0);

        return {
          id: quiz.id,
          title: quiz.title,
          className: (classNamesByQuiz.get(quiz.id) ?? []).join(", "),
          completed: Boolean(attempt),
          score: attempt?.score ?? null,
          maxScore: maxScoreByQuiz.get(quiz.id) ?? 0,
          submittedAt: attempt?.submitted_at ?? null,
          quizDeleted: false,
          bestScore: best?.score ?? attempt?.score ?? null,
          attemptsUsed,
          maxAttempts,
          canRetake:
            Boolean(attempt) &&
            (maxAttempts === null || attemptsUsed < maxAttempts),
        };
      });
    }
  }

  // Attempts whose quiz has since been deleted (quiz_id is SET NULL on
  // delete) aren't reachable via quiz_assignments above - the quiz's own
  // assignment rows are gone too. Surface them from their quiz_title/
  // max_score snapshot instead, so a student doesn't lose their own
  // history just because the teacher deleted the quiz.
  const { data: orphanedAttempts } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_title, max_score, score, submitted_at")
    .eq("student_id", student.id)
    .is("quiz_id", null);

  for (const attempt of orphanedAttempts ?? []) {
    quizzes.push({
      id: attempt.id,
      title: attempt.quiz_title,
      className: "",
      completed: true,
      score: attempt.score,
      maxScore: attempt.max_score,
      submittedAt: attempt.submitted_at,
      quizDeleted: true,
      // The quiz (and its assignment/retry setting) is gone - nothing left
      // to retake.
      bestScore: attempt.score,
      attemptsUsed: 1,
      maxAttempts: null,
      canRetake: false,
    });
  }

  // RLS (is_student_of_class / the student's own ad_hoc_lesson) already
  // scopes this to their own classes and record - the event_type/student_id
  // filter here is belt-and-braces, not the security boundary.
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: calendarEventRows } = await supabase
    .from("calendar_events")
    .select(
      "id, event_type, event_date, start_time, end_time, class_id, class_name, student_id, notes",
    )
    .gte("event_date", todayIso)
    .order("event_date", { ascending: true })
    .limit(100);
  const calendarEvents: PortalCalendarEvent[] = (
    (calendarEventRows ?? []) as unknown as Array<
      PortalCalendarEvent & { student_id: string | null }
    >
  )
    .filter(
      (event) =>
        (event.class_id && classIds.includes(event.class_id)) ||
        event.student_id === student.id,
    )
    .map((event) => ({
      id: event.id,
      event_type: event.event_type,
      event_date: event.event_date,
      start_time: event.start_time,
      end_time: event.end_time,
      class_id: event.class_id,
      class_name: event.class_name,
      notes: event.notes,
    }));

  return {
    student: {
      id: student.id,
      firstName: student.first_name,
      lastName: student.last_name,
      gradeLevel: student.grade_level,
      email: student.email,
      tuitionAmount: student.tuition_amount,
    },
    parents: parents || [],
    classes:
      (classAssignments as StudentClassAssignmentWithClass[] | null)?.map(
        (a) => ({
          id: a.classes.id,
          name: a.classes.name,
          hoursPerWeek: a.classes.hours_per_week,
          archivedAt: a.classes.archived_at,
          startDate: a.classes.start_date ?? null,
          finishDate: a.classes.finish_date ?? null,
        }),
      ) || [],
    schedules: (schedules as ClassScheduleSlot[] | null) || [],
    attendance: (attendance as AttendanceRecord[] | null) || [],
    quizzes,
    calendarEvents,
  };
}
