import { redirect } from "next/navigation";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [
    { data: classes, error: classesError },
    { data: scheduleSlots, error: scheduleError },
    { data: students, error: studentsError },
    { data: attendance, error: attendanceError },
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
  ]);

  const loadErrors = [
    classesError?.message,
    scheduleError?.message,
    studentsError?.message,
    attendanceError?.message,
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

  return (
    <TeacherDashboard
      initialClasses={initialClasses}
      initialSlots={initialSlots}
      initialStudents={initialStudents}
      initialAttendance={initialAttendance}
      loadErrors={loadErrors}
    />
  );
}
