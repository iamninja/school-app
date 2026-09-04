import { redirect } from "next/navigation";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import { createClient } from "@/lib/supabase/server";
import { getBusinessSettingsAction } from "@/app/protected/teacher/business-settings-actions";
import { listReceiptsAction } from "@/app/protected/teacher/receipt-actions";
import { listExpensesAction } from "@/app/protected/teacher/expense-actions";
import {
  listChargeRunsAction,
  listFamilyBalancesAction,
} from "@/app/protected/teacher/billing-actions";
import {
  listAssessmentsAction,
  listAssessmentAssignmentsAction,
} from "@/app/protected/teacher/assessments-actions";

// The Supabase client has no Database generic here, so its select-string
// parser can't determine embed cardinality and infers every embed as an
// array. At runtime, `families` is embedded via the forward FK on
// students.family_id (many students -> one family), so PostgREST actually
// returns a single object (or null), not an array - only the NESTED
// family_parents (has-many from families' side) is really an array.
// Indexing families as an array (families?.[0]) silently returns undefined
// on the real response and drops every parent, so this cast corrects the
// type to match actual runtime shape instead of runtime code moving to
// match the (wrong) inferred type.
type FamilyParentRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  user_id: string | null;
};
type StudentFamilyEmbed = { id: string; family_parents: FamilyParentRow[] } | null;

export default async function TeacherPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/teacher-login");
  }

  const { data: teacherRow } = await supabase
    .from("teachers")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!teacherRow) {
    redirect("/");
  }

  const [
    { data: classes, error: classesError },
    { data: scheduleSlots, error: scheduleError },
    { data: students, error: studentsError },
    { data: attendance, error: attendanceError },
    { data: quizzes, error: quizzesError },
    { data: calendarEvents, error: calendarError },
  ] = await Promise.all([
    supabase
      .from("classes")
      .select(
        "id, name, hours_per_week, grade, archived_at, created_at, start_date, finish_date",
      )
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("class_schedule_slots")
      .select("day, time, class_id, is_two_hour")
      .eq("teacher_id", user.id),
    supabase
      .from("students")
      .select(
        "id, first_name, last_name, grade_level, email, phone, user_id, tuition_amount, created_at, family_id, withdrawn_at, families(id, family_parents(id, name, email, phone, is_primary, user_id)), student_class_assignments(class_id)"
      )
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("attendance_records")
      .select("student_id, class_id, class_name, attendance_date, status")
      .eq("teacher_id", user.id)
      .order("attendance_date", { ascending: false }),
    supabase
      .from("quizzes")
      .select("id, title, description, time_limit_minutes, created_at")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false }),
    // Unbounded, same deliberate v1 call as attendance_records above - a
    // handful of exceptions a month for one teacher. Revisit with a
    // .gte("event_date", ...) window if this ever grows large.
    supabase
      .from("calendar_events")
      .select(
        "id, event_type, event_date, start_time, end_time, class_id, class_name, student_id, student_name, contact_name, contact_phone, title, notes, created_at"
      )
      .eq("teacher_id", user.id)
      .order("event_date", { ascending: true }),
  ]);

  const loadErrors = [
    classesError?.message,
    scheduleError?.message,
    studentsError?.message,
    attendanceError?.message,
    quizzesError?.message,
    calendarError?.message,
  ].filter(Boolean) as string[];

  const initialClasses = (classes ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    hoursPerWeek: item.hours_per_week,
    grade: item.grade,
    archivedAt: item.archived_at,
    startDate: item.start_date,
    finishDate: item.finish_date,
  }));

  const initialSlots = (scheduleSlots ?? []).map((slot) => ({
    day: slot.day,
    time: slot.time,
    classId: slot.class_id,
    isTwoHour: slot.is_two_hour,
  }));

  const initialStudents = (students ?? []).map((student) => {
    const familyEmbed = student.families as unknown as StudentFamilyEmbed;
    const parents = familyEmbed?.family_parents ?? [];
    const primaryParent = parents.find((parent) => parent.is_primary) ?? parents[0];
    const secondaryParent = parents.find((parent) => !parent.is_primary);

    return {
      id: student.id,
      firstName: student.first_name,
      lastName: student.last_name,
      gradeLevel: student.grade_level ?? "",
      email: student.email ?? "",
      phone: student.phone ?? "",
      hasAccount: student.user_id != null,
      familyId: student.family_id,
      withdrawnAt: student.withdrawn_at,
      parentName: primaryParent?.name ?? "",
      parentEmail: primaryParent?.email ?? "",
      parentPhone: primaryParent?.phone ?? "",
      parentHasAccount: primaryParent?.user_id != null,
      parentTwoName: secondaryParent?.name ?? "",
      parentTwoEmail: secondaryParent?.email ?? "",
      parentTwoPhone: secondaryParent?.phone ?? "",
      parentTwoHasAccount: secondaryParent?.user_id != null,
      tuitionAmount:
        student.tuition_amount === null || student.tuition_amount === undefined
          ? ""
          : String(student.tuition_amount),
      assignedClassIds:
        student.student_class_assignments?.map((row) => row.class_id) ?? [],
    };
  });

  const familyMap = new Map<
    string,
    { id: string; parentNames: string[]; parentEmails: string[]; studentNames: string[] }
  >();
  for (const student of students ?? []) {
    const familyId = student.family_id;
    if (!familyMap.has(familyId)) {
      const familyEmbed = student.families as unknown as StudentFamilyEmbed;
      const parents = familyEmbed?.family_parents ?? [];
      familyMap.set(familyId, {
        id: familyId,
        parentNames: parents.map((p) => p.name).filter((n): n is string => Boolean(n)),
        parentEmails: parents.map((p) => p.email).filter((e): e is string => Boolean(e)),
        studentNames: [],
      });
    }
    familyMap
      .get(familyId)!
      .studentNames.push(`${student.first_name} ${student.last_name}`);
  }
  const initialFamilies = Array.from(familyMap.values());

  const initialAttendance = (attendance ?? []).map((record) => ({
    studentId: record.student_id,
    classId: record.class_id,
    className: record.class_name,
    attendanceDate: record.attendance_date,
    status: record.status,
  }));

  const quizIds = (quizzes ?? []).map((quiz) => quiz.id);
  const questionCountByQuiz = new Map<string, number>();
  const assignedClassesByQuiz = new Map<
    string,
    {
      id: string;
      name: string;
      shuffleQuestions: boolean;
      maxAttempts: number | null;
    }[]
  >();
  const quizzesWithAttempts = new Set<string>();
  if (quizIds.length > 0) {
    const classNameById = new Map(
      (classes ?? []).map((classRow) => [classRow.id, classRow.name]),
    );

    const [{ data: questionRows }, { data: assignmentRows }, { data: attemptRows }] =
      await Promise.all([
        supabase.from("quiz_questions").select("quiz_id").in("quiz_id", quizIds),
        supabase
          .from("quiz_assignments")
          .select("quiz_id, class_id, shuffle_questions, max_attempts")
          .in("quiz_id", quizIds),
        supabase.from("quiz_attempts").select("quiz_id").in("quiz_id", quizIds),
      ]);

    for (const row of questionRows ?? []) {
      questionCountByQuiz.set(
        row.quiz_id,
        (questionCountByQuiz.get(row.quiz_id) ?? 0) + 1,
      );
    }

    for (const row of assignmentRows ?? []) {
      const list = assignedClassesByQuiz.get(row.quiz_id) ?? [];
      list.push({
        id: row.class_id,
        name: classNameById.get(row.class_id) ?? "",
        shuffleQuestions: row.shuffle_questions,
        maxAttempts: row.max_attempts,
      });
      assignedClassesByQuiz.set(row.quiz_id, list);
    }

    for (const row of attemptRows ?? []) {
      quizzesWithAttempts.add(row.quiz_id);
    }
  }

  const initialQuizzes = (quizzes ?? []).map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    timeLimitMinutes: quiz.time_limit_minutes,
    assignedClasses: assignedClassesByQuiz.get(quiz.id) ?? [],
    questionCount: questionCountByQuiz.get(quiz.id) ?? 0,
    hasAttempts: quizzesWithAttempts.has(quiz.id),
    createdAt: quiz.created_at,
  }));

  // Business identity + integration config. Credential *statuses* only -
  // getBusinessSettingsAction never returns a decrypted value.
  const businessSettings = await getBusinessSettingsAction();
  const initialReceipts = await listReceiptsAction();
  const initialExpenses = await listExpensesAction();
  const initialFamilyBalances = await listFamilyBalancesAction();
  const initialChargeRuns = await listChargeRunsAction();
  const initialAssessments = await listAssessmentsAction();
  const initialAssessmentAssignments = await listAssessmentAssignmentsAction();

  return (
    <TeacherDashboard
      initialClasses={initialClasses}
      initialSlots={initialSlots}
      initialStudents={initialStudents}
      initialFamilies={initialFamilies}
      initialAttendance={initialAttendance}
      initialQuizzes={initialQuizzes}
      initialAssessments={initialAssessments}
      initialAssessmentAssignments={initialAssessmentAssignments}
      businessProfile={businessSettings.profile}
      integrationSettings={businessSettings.integrations}
      credentialStatuses={businessSettings.credentialStatuses}
      initialReceipts={initialReceipts}
      initialExpenses={initialExpenses}
      initialFamilyBalances={initialFamilyBalances}
      initialChargeRuns={initialChargeRuns}
      initialCalendarEvents={calendarEvents ?? []}
      loadErrors={loadErrors}
    />
  );
}
