"use server";

import { createClient } from "@/lib/supabase/server";
import { RECEIPT_COLUMNS, attachLineItems } from "@/lib/receipts";
import { isAssessmentAssignmentLate } from "@/lib/assessment-status";
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
  Receipt,
  AssessmentSummary,
  AssessmentAssignmentWithAssessment,
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

  // Family balance card. RLS-scoped, same client as everything else here
  // (no service-role bypass) - "Parents view own family" and "Parents
  // view own family balance transactions" already cover this.
  const { data: familyRow } = await supabase
    .from("families")
    .select("balance")
    .eq("id", parent.family_id)
    .maybeSingle();

  const { data: recentTransactionRows } = await supabase
    .from("family_balance_transactions")
    .select("id, type, amount, description, receipt_id, created_at")
    .eq("family_id", parent.family_id)
    .order("created_at", { ascending: false })
    .limit(200);

  // This family's receipts, for the tuition history dialog's "view
  // receipt" flow - RLS-scoped via "Parents view own family receipts"
  // (20260827170752_parent-view-receipts.sql), same is_parent_of_family()
  // boundary as everything else on this page.
  const { data: receiptRows } = await supabase
    .from("receipts")
    .select(RECEIPT_COLUMNS)
    .eq("family_id", parent.family_id)
    .order("issue_date", { ascending: false });
  const receipts = await attachLineItems(
    supabase,
    (receiptRows ?? []) as unknown as Omit<Receipt, "lineItems">[],
  );

  const { data: businessRow } = await supabase
    .from("business_profile")
    .select(
      "id, business_name, afm, doy, activity_code, address, city, postal_code, phone, updated_at",
    )
    .eq("id", 1)
    .maybeSingle();

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
            archived_at,
            start_date,
            finish_date
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
          .select("class_id, day, time, is_two_hour")
          .in("class_id", classIds);
        schedules = (data as ClassScheduleSlot[] | null) || [];
      }

      const { data: attendance } = await supabase
        .from("attendance_records")
        .select("class_id, class_name, attendance_date, status")
        .eq("student_id", student.id)
        .order("attendance_date", { ascending: false })
        .limit(300);

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
          .select("quiz_id, class_id, max_attempts")
          .in("class_id", classIds);

        const quizIds = [
          ...new Set((assignmentRows ?? []).map((a) => a.quiz_id)),
        ];
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
        // Most generous limit across every class this quiz is assigned to
        // for this student - null (unlimited) wins over any finite number,
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
          // The quiz (and its assignment/retry setting) is gone - nothing
          // left to retake.
          bestScore: attempt.score,
          attemptsUsed: 1,
          maxAttempts: null,
          canRetake: false,
        });
      }

      // Assessments: student_id is a direct column on
      // assessment_assignments, so this needs no classIds indirection the
      // way the quizzes block above does.
      const { data: assessmentAssignmentRows } = await supabase
        .from("assessment_assignments")
        .select(
          "id, assessment_id, kind, effective_scheduled_date, effective_scheduled_time, effective_deadline_at, taken_at, status, score, teacher_comment, assessments(title, max_score, class_id, class_name, description)",
        )
        .eq("student_id", student.id)
        .order("created_at", { ascending: false });

      const assessments: AssessmentSummary[] = (
        (assessmentAssignmentRows as unknown as
          | AssessmentAssignmentWithAssessment[]
          | null) ?? []
      ).map((row) => ({
        id: row.id,
        assessmentId: row.assessment_id,
        kind: row.kind,
        title: row.assessments.title,
        description: row.assessments.description,
        className: row.assessments.class_name,
        maxScore: row.assessments.max_score,
        effectiveScheduledDate: row.effective_scheduled_date,
        effectiveScheduledTime: row.effective_scheduled_time,
        effectiveDeadlineAt: row.effective_deadline_at,
        status: row.status,
        score: row.score,
        teacherComment: row.teacher_comment,
        isLate: isAssessmentAssignmentLate({
          kind: row.kind,
          effectiveScheduledDate: row.effective_scheduled_date,
          effectiveScheduledTime: row.effective_scheduled_time,
          effectiveDeadlineAt: row.effective_deadline_at,
          takenAt: row.taken_at,
        }),
      }));

      return {
        student: {
          id: student.id,
          firstName: student.first_name,
          lastName: student.last_name,
          gradeLevel: student.grade_level,
          email: student.email,
          tuitionAmount: student.tuition_amount,
          withdrawnAt: student.withdrawn_at,
        },
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
        schedules,
        attendance: (attendance as AttendanceRecord[] | null) || [],
        quizzes,
        calendarEvents,
        assessments,
      };
    }),
  );

  const monthlyAmount = studentRows.reduce(
    (sum, student) => sum + Number(student.tuition_amount ?? 0),
    0,
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
      balance: {
        amount: Number(familyRow?.balance ?? 0),
        monthlyAmount,
        recentTransactions: (recentTransactionRows ?? []).map((row) => ({
          id: row.id,
          type: row.type,
          amount: Number(row.amount),
          description: row.description,
          createdAt: row.created_at,
          receiptId: row.receipt_id,
        })),
      },
      receipts,
      business: businessRow ?? null,
    },
  };
}
