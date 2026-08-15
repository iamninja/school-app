"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";

export async function createClassAction(data: {
  name: string;
  hoursPerWeek: number;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { data: row, error } = await supabase
    .from("classes")
    .insert({
      teacher_id: user.id,
      name: data.name,
      hours_per_week: data.hoursPerWeek,
    })
    .select("id, name, hours_per_week")
    .single();

  if (error) {
    throw error;
  }

  return {
    id: row.id,
    name: row.name,
    hoursPerWeek: row.hours_per_week,
  };
}

export async function setScheduleSlotAction(data: {
  day: string;
  time: string;
  classId: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  if (!data.classId) {
    const { error } = await supabase
      .from("class_schedule_slots")
      .delete()
      .match({
        teacher_id: user.id,
        day: data.day,
        time: data.time,
      });

    if (error) {
      throw error;
    }

    return { day: data.day, time: data.time, classId: null };
  }

  const { data: row, error } = await supabase
    .from("class_schedule_slots")
    .upsert(
      {
        teacher_id: user.id,
        day: data.day,
        time: data.time,
        class_id: data.classId,
      },
      { onConflict: "teacher_id,day,time" }
    )
    .select("day, time, class_id")
    .single();

  if (error) {
    throw error;
  }

  return { day: row.day, time: row.time, classId: row.class_id };
}

export async function createStudentAction(data: {
  firstName: string;
  lastName: string;
  gradeLevel: string;
  email: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  parentTwoName?: string;
  parentTwoEmail?: string;
  parentTwoPhone?: string;
  tuitionAmount: string;
  tuitionStatus: "current" | "past-due" | "scholarship";
  assignedClassIds: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const tuitionAmount = data.tuitionAmount.trim()
    ? Number.parseFloat(data.tuitionAmount)
    : null;

  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      teacher_id: user.id,
      first_name: data.firstName,
      last_name: data.lastName,
      grade_level: data.gradeLevel || null,
      email: data.email || null,
      tuition_amount: tuitionAmount,
      tuition_status: data.tuitionStatus,
    })
    .select("id")
    .single();

  if (studentError) {
    throw studentError;
  }

  const parentsToInsert = [
    {
      student_id: student.id,
      name: data.parentName || null,
      email: data.parentEmail || null,
      phone: data.parentPhone || null,
      is_primary: true,
    },
  ];

  if (data.parentTwoName || data.parentTwoEmail || data.parentTwoPhone) {
    parentsToInsert.push({
      student_id: student.id,
      name: data.parentTwoName || null,
      email: data.parentTwoEmail || null,
      phone: data.parentTwoPhone || null,
      is_primary: false,
    });
  }

  const { error: parentError } = await supabase
    .from("student_parents")
    .insert(parentsToInsert);

  if (parentError) {
    throw parentError;
  }

  if (data.assignedClassIds.length > 0) {
    const { error: assignmentError } = await supabase
      .from("student_class_assignments")
      .insert(
        data.assignedClassIds.map((classId) => ({
          student_id: student.id,
          class_id: classId,
        }))
      );

    if (assignmentError) {
      throw assignmentError;
    }
  }

  return {
    id: student.id,
    firstName: data.firstName,
    lastName: data.lastName,
    gradeLevel: data.gradeLevel,
    email: data.email,
    parentName: data.parentName,
    parentEmail: data.parentEmail,
    parentPhone: data.parentPhone,
    parentTwoName: data.parentTwoName,
    parentTwoEmail: data.parentTwoEmail,
    parentTwoPhone: data.parentTwoPhone,
    tuitionAmount: data.tuitionAmount,
    tuitionStatus: data.tuitionStatus,
    assignedClassIds: data.assignedClassIds,
  };
}

export async function getAttendanceAction(data: {
  classId: string;
  attendanceDate: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { data: rows, error } = await supabase
    .from("attendance_records")
    .select("student_id, status")
    .eq("teacher_id", user.id)
    .eq("class_id", data.classId)
    .eq("attendance_date", data.attendanceDate);

  if (error) {
    throw error;
  }

  return rows ?? [];
}

export async function setAttendanceAction(data: {
  classId: string;
  studentId: string;
  attendanceDate: string;
  status: "present" | "late" | "absent" | "";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  if (!data.status) {
    const { error } = await supabase
      .from("attendance_records")
      .delete()
      .match({
        teacher_id: user.id,
        class_id: data.classId,
        student_id: data.studentId,
        attendance_date: data.attendanceDate,
      });

    if (error) {
      throw error;
    }

    return { studentId: data.studentId, status: "" };
  }

  const { error } = await supabase
    .from("attendance_records")
    .upsert(
      {
        teacher_id: user.id,
        class_id: data.classId,
        student_id: data.studentId,
        attendance_date: data.attendanceDate,
        status: data.status,
      },
      { onConflict: "teacher_id,class_id,student_id,attendance_date" }
    );

  if (error) {
    throw error;
  }

  return { studentId: data.studentId, status: data.status };
}
