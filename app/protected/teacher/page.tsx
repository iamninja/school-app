import { redirect } from "next/navigation";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/teacher-login");
  }

  const [
    { data: classes, error: classesError },
    { data: scheduleSlots, error: scheduleError },
    { data: students, error: studentsError },
    { data: attendance, error: attendanceError },
    { data: quizzes, error: quizzesError },
  ] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, hours_per_week, created_at")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("class_schedule_slots")
      .select("day, time, class_id")
      .eq("teacher_id", user.id),
    supabase
      .from("students")
      .select(
        "id, first_name, last_name, grade_level, email, tuition_amount, tuition_status, created_at, student_parents(id, name, email, phone, is_primary), student_class_assignments(class_id)"
      )
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("attendance_records")
      .select("student_id, class_id, attendance_date, status")
      .eq("teacher_id", user.id)
      .order("attendance_date", { ascending: false }),
    supabase
      .from("quizzes")
      .select("id, title, description, created_at")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const loadErrors = [
    classesError?.message,
    scheduleError?.message,
    studentsError?.message,
    attendanceError?.message,
    quizzesError?.message,
  ].filter(Boolean) as string[];

  const initialClasses = (classes ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    hoursPerWeek: item.hours_per_week,
  }));

  const initialSlots = (scheduleSlots ?? []).map((slot) => ({
    day: slot.day,
    time: slot.time,
    classId: slot.class_id,
  }));

  const initialStudents = (students ?? []).map((student) => {
    const parents = student.student_parents ?? [];
    const primaryParent = parents.find((parent) => parent.is_primary) ?? parents[0];
    const secondaryParent = parents.find((parent) => !parent.is_primary);

    return {
      id: student.id,
      firstName: student.first_name,
      lastName: student.last_name,
      gradeLevel: student.grade_level ?? "",
      email: student.email ?? "",
      parentName: primaryParent?.name ?? "",
      parentEmail: primaryParent?.email ?? "",
      parentPhone: primaryParent?.phone ?? "",
      parentTwoName: secondaryParent?.name ?? "",
      parentTwoEmail: secondaryParent?.email ?? "",
      parentTwoPhone: secondaryParent?.phone ?? "",
      tuitionAmount:
        student.tuition_amount === null || student.tuition_amount === undefined
          ? ""
          : String(student.tuition_amount),
      tuitionStatus: student.tuition_status,
      assignedClassIds:
        student.student_class_assignments?.map((row) => row.class_id) ?? [],
    };
  });

  const initialAttendance = (attendance ?? []).map((record) => ({
    studentId: record.student_id,
    classId: record.class_id,
    attendanceDate: record.attendance_date,
    status: record.status,
  }));

  const quizIds = (quizzes ?? []).map((quiz) => quiz.id);
  const questionCountByQuiz = new Map<string, number>();
  const assignedClassesByQuiz = new Map<
    string,
    { id: string; name: string }[]
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
          .select("quiz_id, class_id")
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
      list.push({ id: row.class_id, name: classNameById.get(row.class_id) ?? "" });
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
    assignedClasses: assignedClassesByQuiz.get(quiz.id) ?? [],
    questionCount: questionCountByQuiz.get(quiz.id) ?? 0,
    hasAttempts: quizzesWithAttempts.has(quiz.id),
    createdAt: quiz.created_at,
  }));

  return (
    <TeacherDashboard
      initialClasses={initialClasses}
      initialSlots={initialSlots}
      initialStudents={initialStudents}
      initialAttendance={initialAttendance}
      initialQuizzes={initialQuizzes}
      loadErrors={loadErrors}
    />
  );
}
