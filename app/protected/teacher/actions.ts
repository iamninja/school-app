"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

export async function updateClassAction(data: {
  classId: string;
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
    .update({ name: data.name, hours_per_week: data.hoursPerWeek })
    .eq("id", data.classId)
    .eq("teacher_id", user.id)
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

export async function archiveClassAction(classId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const archivedAt = new Date().toISOString();
  const { error } = await supabase
    .from("classes")
    .update({ archived_at: archivedAt })
    .eq("id", classId)
    .eq("teacher_id", user.id);

  if (error) {
    throw error;
  }

  // An archived class can no longer occupy a weekly time slot - drop it
  // from the schedule rather than leaving a dangling reference the teacher
  // can't clear from the (now hidden) unscheduled-classes tray.
  const { error: scheduleError } = await supabase
    .from("class_schedule_slots")
    .delete()
    .eq("class_id", classId)
    .eq("teacher_id", user.id);

  if (scheduleError) {
    throw scheduleError;
  }

  return { id: classId, archivedAt };
}

export async function restoreClassAction(classId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { error } = await supabase
    .from("classes")
    .update({ archived_at: null })
    .eq("id", classId)
    .eq("teacher_id", user.id);

  if (error) {
    throw error;
  }

  return { id: classId, archivedAt: null as string | null };
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

type CreateStudentBase = {
  firstName: string;
  lastName: string;
  gradeLevel: string;
  email: string;
  tuitionAmount: string;
  tuitionStatus: "current" | "past-due" | "scholarship";
  assignedClassIds: string[];
};

export type CreateStudentInput =
  | (CreateStudentBase & {
      familyMode: "new";
      parentName: string;
      parentEmail: string;
      parentPhone: string;
      parentTwoName?: string;
      parentTwoEmail?: string;
      parentTwoPhone?: string;
    })
  | (CreateStudentBase & {
      familyMode: "existing";
      familyId: string;
    });

export async function createStudentAction(data: CreateStudentInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  let familyId: string;

  if (data.familyMode === "existing") {
    const { data: family, error: familyLookupError } = await supabase
      .from("families")
      .select("id")
      .eq("id", data.familyId)
      .eq("teacher_id", user.id)
      .single();

    if (familyLookupError || !family) {
      throw new Error("Family not found");
    }

    familyId = family.id;
  } else {
    const { data: family, error: familyError } = await supabase
      .from("families")
      .insert({ teacher_id: user.id })
      .select("id")
      .single();

    if (familyError) {
      throw familyError;
    }

    familyId = family.id;
  }

  const tuitionAmount = data.tuitionAmount.trim()
    ? Number.parseFloat(data.tuitionAmount)
    : null;

  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      teacher_id: user.id,
      family_id: familyId,
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

  if (data.familyMode === "new") {
    const parentsToInsert = [
      {
        family_id: familyId,
        name: data.parentName || null,
        email: data.parentEmail || null,
        phone: data.parentPhone || null,
        is_primary: true,
      },
    ];

    if (data.parentTwoName || data.parentTwoEmail || data.parentTwoPhone) {
      parentsToInsert.push({
        family_id: familyId,
        name: data.parentTwoName || null,
        email: data.parentTwoEmail || null,
        phone: data.parentTwoPhone || null,
        is_primary: false,
      });
    }

    const { error: parentError } = await supabase
      .from("family_parents")
      .insert(parentsToInsert);

    if (parentError) {
      // 23505 = unique_violation on family_parents_email_unique - the
      // teacher likely meant "Existing family" for this parent's email.
      if (parentError.code === "23505") {
        throw new ExpectedError(
          'This parent email is already registered to another family. Use "Existing family" instead.'
        );
      }
      throw parentError;
    }
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
    familyId,
    firstName: data.firstName,
    lastName: data.lastName,
    gradeLevel: data.gradeLevel,
    email: data.email,
    withdrawnAt: null as string | null,
    parentName: data.familyMode === "new" ? data.parentName : "",
    parentEmail: data.familyMode === "new" ? data.parentEmail : "",
    parentPhone: data.familyMode === "new" ? data.parentPhone : "",
    parentTwoName: data.familyMode === "new" ? data.parentTwoName : undefined,
    parentTwoEmail: data.familyMode === "new" ? data.parentTwoEmail : undefined,
    parentTwoPhone: data.familyMode === "new" ? data.parentTwoPhone : undefined,
    tuitionAmount: data.tuitionAmount,
    tuitionStatus: data.tuitionStatus,
    assignedClassIds: data.assignedClassIds,
  };
}

export type UpdateStudentInput = {
  studentId: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  email: string;
  tuitionAmount: string;
  tuitionStatus: "current" | "past-due" | "scholarship";
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  parentTwoName?: string;
  parentTwoEmail?: string;
  parentTwoPhone?: string;
};

export async function updateStudentAction(data: UpdateStudentInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { data: existingStudent, error: lookupError } = await supabase
    .from("students")
    .select("id, family_id")
    .eq("id", data.studentId)
    .eq("teacher_id", user.id)
    .single();

  if (lookupError || !existingStudent) {
    throw new Error("Student not found");
  }

  const familyId = existingStudent.family_id;

  const tuitionAmount = data.tuitionAmount.trim()
    ? Number.parseFloat(data.tuitionAmount)
    : null;

  const { error: studentError } = await supabase
    .from("students")
    .update({
      first_name: data.firstName,
      last_name: data.lastName,
      grade_level: data.gradeLevel || null,
      email: data.email || null,
      tuition_amount: tuitionAmount,
      tuition_status: data.tuitionStatus,
    })
    .eq("id", data.studentId)
    .eq("teacher_id", user.id);

  if (studentError) {
    throw studentError;
  }

  const { data: existingParents, error: parentsLookupError } = await supabase
    .from("family_parents")
    .select("id, is_primary")
    .eq("family_id", familyId);

  if (parentsLookupError) {
    throw parentsLookupError;
  }

  const primaryParent = (existingParents ?? []).find((p) => p.is_primary);
  const secondaryParent = (existingParents ?? []).find((p) => !p.is_primary);

  const parentUpserts: Array<{
    id?: string;
    family_id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
  }> = [];

  if (primaryParent) {
    parentUpserts.push({
      id: primaryParent.id,
      family_id: familyId,
      name: data.parentName || null,
      email: data.parentEmail || null,
      phone: data.parentPhone || null,
      is_primary: true,
    });
  } else if (data.parentName || data.parentEmail || data.parentPhone) {
    parentUpserts.push({
      family_id: familyId,
      name: data.parentName || null,
      email: data.parentEmail || null,
      phone: data.parentPhone || null,
      is_primary: true,
    });
  }

  if (secondaryParent) {
    parentUpserts.push({
      id: secondaryParent.id,
      family_id: familyId,
      name: data.parentTwoName || null,
      email: data.parentTwoEmail || null,
      phone: data.parentTwoPhone || null,
      is_primary: false,
    });
  } else if (data.parentTwoName || data.parentTwoEmail || data.parentTwoPhone) {
    parentUpserts.push({
      family_id: familyId,
      name: data.parentTwoName || null,
      email: data.parentTwoEmail || null,
      phone: data.parentTwoPhone || null,
      is_primary: false,
    });
  }

  if (parentUpserts.length > 0) {
    const { error: parentError } = await supabase
      .from("family_parents")
      .upsert(parentUpserts);

    if (parentError) {
      // 23505 = unique_violation on family_parents_email_unique - this
      // parent's email is already registered to a different family.
      if (parentError.code === "23505") {
        throw new ExpectedError(
          "This parent email is already registered to another family.",
        );
      }
      throw parentError;
    }
  }

  return {
    id: data.studentId,
    familyId,
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
  };
}

export async function withdrawStudentAction(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const withdrawnAt = new Date().toISOString();
  const { error } = await supabase
    .from("students")
    .update({ withdrawn_at: withdrawnAt })
    .eq("id", studentId)
    .eq("teacher_id", user.id);

  if (error) {
    throw error;
  }

  return { id: studentId, withdrawnAt };
}

export async function restoreStudentAction(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { error } = await supabase
    .from("students")
    .update({ withdrawn_at: null })
    .eq("id", studentId)
    .eq("teacher_id", user.id);

  if (error) {
    throw error;
  }

  return { id: studentId, withdrawnAt: null as string | null };
}

// RLS on student_class_assignments only checks that the student belongs to
// the calling teacher, not the class - verify both explicitly here rather
// than rely on the database catching a cross-teacher class_id.
async function requireOwnedStudent(
  supabase: SupabaseServerClient,
  studentId: string,
  teacherId: string,
) {
  const { data: student, error } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("teacher_id", teacherId)
    .single();

  if (error || !student) {
    throw new Error("Student not found");
  }
}

async function requireOwnedClass(
  supabase: SupabaseServerClient,
  classId: string,
  teacherId: string,
) {
  const { data: classRow, error } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", teacherId)
    .single();

  if (error || !classRow) {
    throw new Error("Class not found");
  }
}

export async function enrollStudentInClassAction(
  studentId: string,
  classId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);
  await requireOwnedStudent(supabase, studentId, user.id);
  await requireOwnedClass(supabase, classId, user.id);

  const { error } = await supabase
    .from("student_class_assignments")
    .upsert(
      { student_id: studentId, class_id: classId },
      { onConflict: "student_id,class_id", ignoreDuplicates: true },
    );

  if (error) {
    throw error;
  }
}

export async function unenrollStudentFromClassAction(
  studentId: string,
  classId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);
  await requireOwnedStudent(supabase, studentId, user.id);
  await requireOwnedClass(supabase, classId, user.id);

  const { error } = await supabase
    .from("student_class_assignments")
    .delete()
    .eq("student_id", studentId)
    .eq("class_id", classId);

  if (error) {
    throw error;
  }
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
