"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  ParentEmailCheckResult,
  ParentDashboardData,
  ParentDashboardChild,
  StudentClassAssignmentWithClass,
  ClassScheduleSlot,
  AttendanceRecord,
  ActionResult,
  QuizSummary,
  PortalCalendarEvent,
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
      "Δεν βρέθηκε γονέας με αυτό το email. Επικοινωνήστε με τον καθηγητή του παιδιού σας.",
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
    return { success: false, error: "Δεν έχετε συνδεθεί" };
  }

  const { data: parent, error: parentError } = await supabase
    .from("family_parents")
    .select("id, name, email, phone, is_primary, family_id")
    .eq("user_id", user.id)
    .single();

  if (parentError || !parent) {
    return { success: false, error: "Δεν βρέθηκε λογαριασμός γονέα" };
  }

  const { data: allParents } = await supabase
    .from("family_parents")
    .select("name, email, phone, is_primary")
    .eq("family_id", parent.family_id)
    .order("is_primary", { ascending: false });

  // Every non-withdrawn child in this family - hidden by default, matching
  // the teacher dashboard's "hidden unless toggled" withdrawn-student
  // behavior.
  const { data: studentRows, error: studentsError } = await supabase
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
    return {
      success: false,
      error: "Δεν βρέθηκαν μαθητές για αυτή την οικογένεια",
    };
  }

  // One query for every upcoming calendar event RLS lets this parent see,
  // partitioned per child below - cheaper than one query per child, and RLS
  // (is_parent_of_class / is_parent_of_student) already scopes this to
  // their own family, so the per-child filter here is belt-and-braces
  // (needed regardless for a multi-child parent, so one child's card
  // doesn't show a sibling's events) rather than a security boundary.
  const todayIso = new Date().toISOString().slice(0, 10);
  const { data: calendarEventRows } = await supabase
    .from("calendar_events")
    .select(
      "id, event_type, event_date, start_time, end_time, class_id, class_name, student_id, notes",
    )
    .gte("event_date", todayIso)
    .order("event_date", { ascending: true })
    .limit(100);
  const upcomingCalendarEvents = (calendarEventRows ?? []) as unknown as Array<
    PortalCalendarEvent & { student_id: string | null }
  >;

  const children: ParentDashboardChild[] = await Promise.all(
    studentRows.map(async (student) => {
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
      const classIds =
        (classAssignments as StudentClassAssignmentWithClass[] | null)
          ?.map((a) => a.class_id)
          .filter(Boolean) || [];

      const calendarEvents: PortalCalendarEvent[] = upcomingCalendarEvents
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

      let schedules: ClassScheduleSlot[] = [];
      if (classIds.length > 0) {
        const { data } = await supabase
          .from("class_schedule_slots")
          .select("class_id, day, time")
          .in("class_id", classIds);
        schedules = (data as ClassScheduleSlot[] | null) || [];
      }

      const { data: attendance } = await supabase
        .from("attendance_records")
        .select("class_id, class_name, attendance_date, status")
        .eq("student_id", student.id)
        .order("attendance_date", { ascending: false })
        .limit(50);

      // Quizzes + this child's attempts.
      let quizzes: QuizSummary[] = [];
      if (classIds.length > 0) {
        const classNameById = new Map(
          (
            classAssignments as StudentClassAssignmentWithClass[] | null ?? []
          ).map((a) => [a.class_id, a.classes.name]),
        );

        const { data: assignmentRows } = await supabase
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
              supabase.from("quizzes").select("id, title").in("id", quizIds),
              supabase
                .from("quiz_attempts")
                .select("quiz_id, score, submitted_at")
                .eq("student_id", student.id)
                .in("quiz_id", quizIds),
              supabase
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
              quizDeleted: false,
            };
          });
        }
      }

      // Attempts whose quiz has since been deleted (quiz_id is SET NULL on
      // delete) aren't reachable via quiz_assignments above - the quiz's
      // own assignment rows are gone too. Surface them from their
      // quiz_title/max_score snapshot instead, so a student doesn't lose
      // their own history just because the teacher deleted the quiz.
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
        });
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
              archivedAt: a.classes.archived_at,
            }),
          ) || [],
        schedules,
        attendance: (attendance as AttendanceRecord[] | null) || [],
        quizzes,
        calendarEvents,
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
