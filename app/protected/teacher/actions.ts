"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { SCHEDULE_ROWS } from "@/lib/schedule-grid";

// The (day, time) one grid row below - null when `time` is that day's last
// SCHEDULE_ROWS entry, since a 2-hour lesson can't extend past it.
function nextScheduleRowTime(day: string, time: string): string | null {
  const column: "time" | "satTime" = day === "Sat" ? "satTime" : "time";
  const index = SCHEDULE_ROWS.findIndex((row) => row[column] === time);
  const next = index === -1 ? undefined : SCHEDULE_ROWS[index + 1];
  return next ? next[column] : null;
}

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Shared by create/update: 'per_lesson' requires a positive rate, and
// switching back to 'monthly' clears any stale rate rather than leaving it
// dangling (the DB CHECK would allow a stale rate to survive, which is a
// footgun if the class is ever switched back).
function resolveBilling(data: {
  billingType?: "monthly" | "per_lesson";
  lessonRate?: number | null;
}): { billing_type: "monthly" | "per_lesson"; lesson_rate: number | null } {
  const billingType = data.billingType ?? "monthly";
  if (billingType === "per_lesson") {
    if (!Number.isFinite(data.lessonRate) || (data.lessonRate ?? 0) <= 0) {
      throw new ExpectedError("Set a rate per lesson for a per-lesson class");
    }
    return { billing_type: "per_lesson", lesson_rate: data.lessonRate! };
  }
  return { billing_type: "monthly", lesson_rate: null };
}

// Advisory only - the class update itself has already succeeded by the
// time this runs, so a mismatch here is a heads-up, never a save blocker.
// Guards the two ways switching a class's billing mode silently costs the
// teacher money: an active student left with a stale tuition_amount after
// the class goes per-lesson (double-charged via both paths), or left with
// none after the class goes back to monthly (not charged at all).
async function computeBillingMismatchWarning(
  supabase: SupabaseServerClient,
  classId: string,
  billingType: "monthly" | "per_lesson",
): Promise<string | null> {
  const { data: rows, error } = await supabase
    .from("student_class_assignments")
    .select("students!inner(first_name, last_name, tuition_amount, withdrawn_at)")
    .eq("class_id", classId)
    .is("students.withdrawn_at", null);

  if (error) {
    return null;
  }

  const students = (rows ?? []).map(
    (row) =>
      row.students as unknown as {
        first_name: string;
        last_name: string;
        tuition_amount: string | number | null;
      },
  );

  const mismatched =
    billingType === "per_lesson"
      ? students.filter((s) => Number(s.tuition_amount ?? 0) > 0)
      : students.filter((s) => s.tuition_amount === null);

  if (mismatched.length === 0) {
    return null;
  }

  const names = mismatched
    .map((s) => `${s.first_name} ${s.last_name}`)
    .join(", ");

  return billingType === "per_lesson"
    ? `Still has a monthly tuition set — clear it to avoid double-charging: ${names}`
    : `No monthly tuition set — won't be billed until you set one: ${names}`;
}

// Mirror of computeBillingMismatchWarning from the student's side: this is
// the more common way a mismatch actually arises - assigning an existing
// student (who may already have a monthly tuition) into a per-lesson
// class, or vice versa - rather than flipping a class's mode after the
// fact. Advisory only, same reasoning as the class-side check. Skipped
// entirely for a withdrawn student - they're not being billed either way.
async function computeStudentBillingMismatchWarning(
  supabase: SupabaseServerClient,
  studentId: string,
): Promise<string | null> {
  const { data: student } = await supabase
    .from("students")
    .select("tuition_amount, withdrawn_at")
    .eq("id", studentId)
    .maybeSingle();

  if (!student || student.withdrawn_at) {
    return null;
  }

  const { data: rows, error } = await supabase
    .from("student_class_assignments")
    .select("classes!inner(name, billing_type)")
    .eq("student_id", studentId);

  if (error) {
    return null;
  }

  const classes = (rows ?? []).map(
    (row) =>
      row.classes as unknown as { name: string; billing_type: string },
  );

  const hasTuition = Number(student.tuition_amount ?? 0) > 0;
  const perLessonClasses = classes.filter((c) => c.billing_type === "per_lesson");
  const monthlyClasses = classes.filter((c) => c.billing_type === "monthly");

  const warnings: string[] = [];

  if (hasTuition && perLessonClasses.length > 0) {
    warnings.push(
      `also billed per lesson in ${perLessonClasses.map((c) => c.name).join(", ")} — clear their monthly tuition to avoid double-charging`,
    );
  }
  if (!hasTuition && monthlyClasses.length > 0) {
    warnings.push(
      `enrolled in ${monthlyClasses.map((c) => c.name).join(", ")} (monthly billing) with no monthly tuition set — won't be charged for it`,
    );
  }

  return warnings.length > 0 ? warnings.join("; also ") : null;
}

const CLASS_COLUMNS =
  "id, name, hours_per_week, grade, start_date, finish_date, billing_type, lesson_rate";

function toClassResult(row: {
  id: string;
  name: string;
  hours_per_week: number;
  grade: string | null;
  start_date: string | null;
  finish_date: string | null;
  billing_type: string;
  lesson_rate: string | number | null;
}) {
  return {
    id: row.id,
    name: row.name,
    hoursPerWeek: row.hours_per_week,
    grade: row.grade,
    startDate: row.start_date,
    finishDate: row.finish_date,
    billingType: row.billing_type as "monthly" | "per_lesson",
    lessonRate: row.lesson_rate === null ? null : Number(row.lesson_rate),
  };
}

export async function createClassAction(data: {
  name: string;
  hoursPerWeek: number;
  grade?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
  billingType?: "monthly" | "per_lesson";
  lessonRate?: number | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const billing = resolveBilling(data);

  const { data: row, error } = await supabase
    .from("classes")
    .insert({
      teacher_id: user.id,
      name: data.name,
      hours_per_week: data.hoursPerWeek,
      grade: data.grade ?? null,
      start_date: data.startDate ?? null,
      finish_date: data.finishDate ?? null,
      ...billing,
    })
    .select(CLASS_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  return toClassResult(row);
}

export async function updateClassAction(data: {
  classId: string;
  name: string;
  hoursPerWeek: number;
  grade?: string | null;
  startDate?: string | null;
  finishDate?: string | null;
  billingType?: "monthly" | "per_lesson";
  lessonRate?: number | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const billing = resolveBilling(data);

  const { data: row, error } = await supabase
    .from("classes")
    .update({
      name: data.name,
      hours_per_week: data.hoursPerWeek,
      grade: data.grade ?? null,
      start_date: data.startDate ?? null,
      finish_date: data.finishDate ?? null,
      ...billing,
    })
    .eq("id", data.classId)
    .eq("teacher_id", user.id)
    .select(CLASS_COLUMNS)
    .single();

  if (error) {
    throw error;
  }

  const billingWarning = await computeBillingMismatchWarning(
    supabase,
    data.classId,
    billing.billing_type,
  );

  return { ...toClassResult(row), billingWarning };
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

export async function deleteClassAction(classId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  // No history-check guard - attendance_records.class_id is ON DELETE SET
  // NULL with class_name snapshotted at record time, so a student's
  // attendance history survives the class itself being deleted.
  // student_class_assignments and quiz_assignments cascade away freely -
  // they're current-membership rows, not history.
  const { error } = await supabase
    .from("classes")
    .delete()
    .eq("id", classId)
    .eq("teacher_id", user.id);

  if (error) {
    throw error;
  }
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
  isTwoHour?: boolean;
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

    return { day: data.day, time: data.time, classId: null, isTwoHour: false };
  }

  const isTwoHour = data.isTwoHour ?? false;

  if (isTwoHour) {
    const nextTime = nextScheduleRowTime(data.day, data.time);
    if (!nextTime) {
      throw new ExpectedError(
        "Can't extend this slot to 2 hours — it's the last slot of the day.",
      );
    }
    const { data: nextSlot, error: nextSlotError } = await supabase
      .from("class_schedule_slots")
      .select("class_id")
      .match({ teacher_id: user.id, day: data.day, time: nextTime })
      .maybeSingle();
    if (nextSlotError) {
      throw nextSlotError;
    }
    if (nextSlot && nextSlot.class_id !== data.classId) {
      throw new ExpectedError(
        "Can't extend this slot to 2 hours — the next slot is already taken.",
      );
    }
  }

  const { data: row, error } = await supabase
    .from("class_schedule_slots")
    .upsert(
      {
        teacher_id: user.id,
        day: data.day,
        time: data.time,
        class_id: data.classId,
        is_two_hour: isTwoHour,
      },
      { onConflict: "teacher_id,day,time" }
    )
    .select("day, time, class_id, is_two_hour")
    .single();

  if (error) {
    throw error;
  }

  return {
    day: row.day,
    time: row.time,
    classId: row.class_id,
    isTwoHour: row.is_two_hour,
  };
}

type CreateStudentBase = {
  firstName: string;
  lastName: string;
  gradeLevel: string;
  email: string;
  phone?: string;
  tuitionAmount: string;
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
      phone: data.phone || null,
      tuition_amount: tuitionAmount,
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

  const billingWarning = await computeStudentBillingMismatchWarning(
    supabase,
    student.id,
  );

  return {
    id: student.id,
    familyId,
    firstName: data.firstName,
    lastName: data.lastName,
    gradeLevel: data.gradeLevel,
    email: data.email,
    phone: data.phone ?? "",
    withdrawnAt: null as string | null,
    parentName: data.familyMode === "new" ? data.parentName : "",
    parentEmail: data.familyMode === "new" ? data.parentEmail : "",
    parentPhone: data.familyMode === "new" ? data.parentPhone : "",
    parentTwoName: data.familyMode === "new" ? data.parentTwoName : undefined,
    parentTwoEmail: data.familyMode === "new" ? data.parentTwoEmail : undefined,
    parentTwoPhone: data.familyMode === "new" ? data.parentTwoPhone : undefined,
    tuitionAmount: data.tuitionAmount,
    assignedClassIds: data.assignedClassIds,
    billingWarning,
  };
}

export type UpdateStudentInput = {
  studentId: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  email: string;
  phone?: string;
  tuitionAmount: string;
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
      phone: data.phone || null,
      tuition_amount: tuitionAmount,
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

  const billingWarning = await computeStudentBillingMismatchWarning(
    supabase,
    data.studentId,
  );

  return {
    id: data.studentId,
    familyId,
    firstName: data.firstName,
    lastName: data.lastName,
    gradeLevel: data.gradeLevel,
    email: data.email,
    phone: data.phone ?? "",
    parentName: data.parentName,
    parentEmail: data.parentEmail,
    parentPhone: data.parentPhone,
    parentTwoName: data.parentTwoName,
    parentTwoEmail: data.parentTwoEmail,
    parentTwoPhone: data.parentTwoPhone,
    tuitionAmount: data.tuitionAmount,
    billingWarning,
  };
}

// Kills a student's or parent's login (auth.users row) and clears the
// roster row's user_id, so a lost-password-and-lost-email-access or a
// mis-typed-registration-email account can register fresh. The roster row
// itself (and everything keyed off its id - receipts, balance, quiz
// attempts, attendance) is never touched: students.user_id/
// family_parents.user_id are both ON DELETE SET NULL, not cascade.
export async function resetStudentAccountAction(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { data: student, error: lookupError } = await supabase
    .from("students")
    .select("id, user_id")
    .eq("id", studentId)
    .eq("teacher_id", user.id)
    .single();

  if (lookupError || !student) {
    throw new Error("Student not found");
  }

  if (!student.user_id) {
    throw new ExpectedError(
      "This student doesn't have an account to reset yet.",
    );
  }

  const supabaseAdmin = createServiceRoleClient();
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
    student.user_id,
  );

  if (deleteError) {
    // The auth user may already be gone (e.g. deleted directly via the
    // Supabase dashboard before this action existed) - clear the stale
    // link ourselves rather than leaving the student permanently unable
    // to re-register over something already effectively done.
    const { error: clearError } = await supabase
      .from("students")
      .update({ user_id: null })
      .eq("id", studentId);
    if (clearError) {
      throw deleteError;
    }
  }

  return { id: studentId };
}

export async function resetParentAccountAction(params: {
  studentId: string;
  parentSlot: "primary" | "secondary";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { data: student, error: studentLookupError } = await supabase
    .from("students")
    .select("id, family_id")
    .eq("id", params.studentId)
    .eq("teacher_id", user.id)
    .single();

  if (studentLookupError || !student) {
    throw new Error("Student not found");
  }

  const { data: parents, error: parentsLookupError } = await supabase
    .from("family_parents")
    .select("id, user_id, is_primary")
    .eq("family_id", student.family_id);

  if (parentsLookupError) {
    throw parentsLookupError;
  }

  const parent = (parents ?? []).find((p) =>
    params.parentSlot === "primary" ? p.is_primary : !p.is_primary,
  );

  if (!parent) {
    throw new Error("Parent not found");
  }

  if (!parent.user_id) {
    throw new ExpectedError(
      "This parent doesn't have an account to reset yet.",
    );
  }

  const supabaseAdmin = createServiceRoleClient();
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(
    parent.user_id,
  );

  if (deleteError) {
    const { error: clearError } = await supabase
      .from("family_parents")
      .update({ user_id: null })
      .eq("id", parent.id);
    if (clearError) {
      throw deleteError;
    }
  }

  return { familyId: student.family_id, parentSlot: params.parentSlot };
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
): Promise<{ billingWarning: string | null }> {
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

  const billingWarning = await computeStudentBillingMismatchWarning(
    supabase,
    studentId,
  );

  return { billingWarning };
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
  className: string;
  studentId: string;
  attendanceDate: string;
  status: "present" | "late" | "absent" | "split" | "";
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
        class_name: data.className,
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
