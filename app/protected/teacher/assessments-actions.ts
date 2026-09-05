"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { isAssessmentAssignmentLate } from "@/lib/assessment-status";
import type {
  Assessment,
  AssessmentInput,
  TeacherAssessmentAssignmentRow,
  TeacherAssessmentListItem,
  AssessmentAssignmentStatus,
} from "@/lib/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const ASSESSMENT_COLUMNS =
  "id, kind, title, description, max_score, duration_minutes, scheduled_date, " +
  "scheduled_time, deadline_at, class_id, class_name, grade, created_at";

// Kept in sync with lib/class-grades.ts's CLASS_GRADES codes (also the
// DB's own CHECK constraint) - validated here so an invalid value comes
// back as a readable ExpectedError instead of a raw Postgres error.
const VALID_GRADES = new Set([
  "gym_a", "gym_b", "gym_c",
  "lyk_a", "lyk_b", "lyk_c",
  "epal_a", "epal_b", "epal_c",
  "lyk_grad", "epal_grad",
]);

const ASSIGNMENT_COLUMNS =
  "id, assessment_id, student_id, kind, effective_scheduled_date, effective_scheduled_time, " +
  "effective_deadline_at, taken_at, status, score, teacher_comment, created_at";

const ASSIGNMENT_COLUMNS_WITH_STUDENT = `${ASSIGNMENT_COLUMNS}, students:student_id (first_name, last_name)`;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

async function requireTeacherSession(): Promise<{
  supabase: SupabaseServerClient;
  userId: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);
  return { supabase, userId: user.id };
}

function isValidDateString(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
}

function isValidDateTimeString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

type RawAssignmentRow = {
  id: string;
  assessment_id: string;
  student_id: string;
  kind: "short_assessment" | "mock_exam";
  effective_scheduled_date: string | null;
  effective_scheduled_time: string | null;
  effective_deadline_at: string | null;
  taken_at: string | null;
  status: AssessmentAssignmentStatus;
  score: number | null;
  teacher_comment: string | null;
  created_at: string;
  students: { first_name: string; last_name: string } | null;
};

function toTeacherAssignmentRow(
  row: RawAssignmentRow,
): TeacherAssessmentAssignmentRow {
  return {
    id: row.id,
    assessment_id: row.assessment_id,
    student_id: row.student_id,
    kind: row.kind,
    effective_scheduled_date: row.effective_scheduled_date,
    effective_scheduled_time: row.effective_scheduled_time,
    effective_deadline_at: row.effective_deadline_at,
    taken_at: row.taken_at,
    status: row.status,
    score: row.score,
    teacher_comment: row.teacher_comment,
    created_at: row.created_at,
    studentName: row.students
      ? `${row.students.first_name} ${row.students.last_name}`.trim()
      : "",
    isLate: isAssessmentAssignmentLate({
      kind: row.kind,
      effectiveScheduledDate: row.effective_scheduled_date,
      effectiveScheduledTime: row.effective_scheduled_time,
      effectiveDeadlineAt: row.effective_deadline_at,
      takenAt: row.taken_at,
    }),
  };
}

// Validates kind-specific fields and returns the assessments-table row
// shape (minus class_id/class_name, which the caller resolves separately
// since only createAssessmentAction/updateAssessmentAction need the
// ownership lookup that produces them). Shared so create/update can't
// drift out of sync with each other or with the DB's own shape/duration
// CHECK constraints - these checks exist to turn a raw Postgres
// constraint violation into a readable ExpectedError before it ever
// reaches the database.
function validateAssessmentFields(
  input: AssessmentInput,
): Record<string, unknown> {
  const title = input.title.trim();
  if (!title) {
    throw new ExpectedError("Give the assessment a title");
  }
  if (!(input.maxScore > 0)) {
    throw new ExpectedError("Max score must be greater than 0");
  }
  if (input.grade && !VALID_GRADES.has(input.grade)) {
    throw new ExpectedError("Pick a valid grade");
  }
  const grade = input.grade || null;

  if (input.kind === "short_assessment") {
    if (!(input.durationMinutes > 0 && input.durationMinutes <= 60)) {
      throw new ExpectedError(
        "A short assessment's duration must be 1-60 minutes",
      );
    }
    if (input.scheduledDate || input.scheduledTime) {
      throw new ExpectedError(
        "A short assessment doesn't have a scheduled date",
      );
    }
    if (input.deadlineAt && !isValidDateTimeString(input.deadlineAt)) {
      throw new ExpectedError("Pick a valid deadline");
    }
    return {
      kind: "short_assessment",
      title,
      description: input.description?.trim() || null,
      max_score: input.maxScore,
      duration_minutes: input.durationMinutes,
      scheduled_date: null,
      scheduled_time: null,
      deadline_at: input.deadlineAt || null,
      grade,
    };
  }

  // mock_exam
  if (!(input.durationMinutes >= 60 && input.durationMinutes <= 180)) {
    throw new ExpectedError("A mock exam's duration must be 60-180 minutes");
  }
  if (!input.scheduledDate || !isValidDateString(input.scheduledDate)) {
    throw new ExpectedError("Pick a valid exam date");
  }
  if (input.scheduledTime && !TIME_PATTERN.test(input.scheduledTime)) {
    throw new ExpectedError("Enter the exam time as HH:MM");
  }
  if (input.deadlineAt) {
    throw new ExpectedError("A mock exam doesn't have a deadline");
  }
  return {
    kind: "mock_exam",
    title,
    description: input.description?.trim() || null,
    max_score: input.maxScore,
    duration_minutes: input.durationMinutes,
    scheduled_date: input.scheduledDate,
    scheduled_time: input.scheduledTime || null,
    deadline_at: null,
    grade,
  };
}

export async function listAssessmentsAction(): Promise<
  TeacherAssessmentListItem[]
> {
  const { supabase } = await requireTeacherSession();

  const [
    { data: assessments, error: assessmentsError },
    { data: assignments, error: assignmentsError },
  ] = await Promise.all([
    supabase
      .from("assessments")
      .select(ASSESSMENT_COLUMNS)
      .order("created_at", { ascending: false }),
    supabase.from("assessment_assignments").select("assessment_id, status"),
  ]);

  if (assessmentsError) throw assessmentsError;
  if (assignmentsError) throw assignmentsError;

  const countsByAssessment = new Map<
    string,
    { count: number; marked: number }
  >();
  for (const row of assignments ?? []) {
    const entry = countsByAssessment.get(row.assessment_id) ?? {
      count: 0,
      marked: 0,
    };
    entry.count += 1;
    if (row.status === "marked") entry.marked += 1;
    countsByAssessment.set(row.assessment_id, entry);
  }

  return ((assessments ?? []) as unknown as Assessment[]).map((assessment) => {
    const counts = countsByAssessment.get(assessment.id) ?? {
      count: 0,
      marked: 0,
    };
    return {
      ...assessment,
      assignmentCount: counts.count,
      markedCount: counts.marked,
    };
  });
}

export async function listAssessmentAssignmentsAction(): Promise<
  TeacherAssessmentAssignmentRow[]
> {
  const { supabase } = await requireTeacherSession();

  const { data, error } = await supabase
    .from("assessment_assignments")
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as RawAssignmentRow[]).map(
    toTeacherAssignmentRow,
  );
}

export async function createAssessmentAction(input: AssessmentInput): Promise<{
  assessment: Assessment;
  assignments: TeacherAssessmentAssignmentRow[];
}> {
  const { supabase, userId } = await requireTeacherSession();

  const hasClass = Boolean(input.classId);
  const hasStudents = Boolean(input.studentIds && input.studentIds.length > 0);
  if (hasClass === hasStudents) {
    throw new ExpectedError(
      "Assign the assessment to either a class or specific students",
    );
  }

  const row = validateAssessmentFields(input);
  row.teacher_id = userId;
  row.class_id = null;
  row.class_name = null;

  // Ownership re-validation: ownership of class_id/studentIds is never
  // trusted from the client - both branches re-fetch scoped by
  // teacher_id, and the class branch's fetch doubles as the class_name
  // snapshot source.
  let studentIds: string[];
  if (hasClass) {
    const { data: classRow, error: classError } = await supabase
      .from("classes")
      .select("id, name")
      .eq("id", input.classId!)
      .eq("teacher_id", userId)
      .maybeSingle();
    if (classError || !classRow) {
      throw new ExpectedError("That class no longer exists");
    }
    row.class_id = classRow.id;
    row.class_name = classRow.name;

    const { data: rosterRows, error: rosterError } = await supabase
      .from("student_class_assignments")
      .select("student_id")
      .eq("class_id", classRow.id);
    if (rosterError) throw rosterError;
    studentIds = (rosterRows ?? []).map((r) => r.student_id);
    if (studentIds.length === 0) {
      throw new ExpectedError("This class has no enrolled students yet");
    }
  } else {
    const { data: studentRows, error: studentsError } = await supabase
      .from("students")
      .select("id")
      .eq("teacher_id", userId)
      .in("id", input.studentIds!);
    if (studentsError) throw studentsError;
    if ((studentRows ?? []).length !== input.studentIds!.length) {
      throw new ExpectedError("One of the selected students no longer exists");
    }
    studentIds = (studentRows ?? []).map((r) => r.id);
  }

  const { data: insertedAssessment, error: assessmentError } = await supabase
    .from("assessments")
    .insert(row)
    .select(ASSESSMENT_COLUMNS)
    .single();
  if (assessmentError) throw assessmentError;
  const assessment = insertedAssessment as unknown as Assessment;

  const assignmentRows = studentIds.map((studentId) => ({
    teacher_id: userId,
    assessment_id: assessment.id,
    student_id: studentId,
    kind: row.kind,
    effective_scheduled_date: row.scheduled_date,
    effective_scheduled_time: row.scheduled_time,
    effective_deadline_at: row.deadline_at,
  }));

  const { data: assignments, error: assignmentsError } = await supabase
    .from("assessment_assignments")
    .insert(assignmentRows)
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT);
  if (assignmentsError) throw assignmentsError;

  return {
    assessment,
    assignments: ((assignments ?? []) as unknown as RawAssignmentRow[]).map(
      toTeacherAssignmentRow,
    ),
  };
}

// Template-only edit - never touches existing assignments' effective_*
// columns, so a date change here doesn't silently move an assessment out
// from under a student the teacher already rescheduled individually.
export async function updateAssessmentAction(
  assessmentId: string,
  input: AssessmentInput,
): Promise<Assessment> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("assessments")
    .select("id, kind")
    .eq("id", assessmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That assessment no longer exists");
  }
  if (existing.kind !== input.kind) {
    throw new ExpectedError(
      "An assessment's kind can't be changed - delete it and create a new one.",
    );
  }

  const row = validateAssessmentFields(input);

  const { data, error } = await supabase
    .from("assessments")
    .update(row)
    .eq("id", assessmentId)
    .eq("teacher_id", userId)
    .select(ASSESSMENT_COLUMNS)
    .single();
  if (error) throw error;

  return data as unknown as Assessment;
}

export async function deleteAssessmentAction(
  assessmentId: string,
): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();

  // assessment_assignments cascades with its parent assessment (see the
  // migration) - no separate cleanup needed here.
  const { error } = await supabase
    .from("assessments")
    .delete()
    .eq("id", assessmentId)
    .eq("teacher_id", userId);
  if (error) throw error;
}

// The "add a latecomer" flow (requirement 4): defaults the new
// assignment's effective_* from the assessment's CURRENT template values,
// same as createAssessmentAction's class-roster snapshot does at creation
// time.
export async function addStudentToAssessmentAction(
  assessmentId: string,
  studentId: string,
): Promise<TeacherAssessmentAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: assessment, error: assessmentError } = await supabase
    .from("assessments")
    .select("id, kind, scheduled_date, scheduled_time, deadline_at")
    .eq("id", assessmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (assessmentError || !assessment) {
    throw new ExpectedError("That assessment no longer exists");
  }

  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (studentError || !student) {
    throw new ExpectedError("That student no longer exists");
  }

  const { data, error } = await supabase
    .from("assessment_assignments")
    .insert({
      teacher_id: userId,
      assessment_id: assessment.id,
      student_id: student.id,
      kind: assessment.kind,
      effective_scheduled_date: assessment.scheduled_date,
      effective_scheduled_time: assessment.scheduled_time,
      effective_deadline_at: assessment.deadline_at,
    })
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ExpectedError(
        "This student is already assigned to this assessment",
      );
    }
    throw error;
  }

  return toTeacherAssignmentRow(data as unknown as RawAssignmentRow);
}

export async function removeStudentFromAssessmentAction(
  assignmentId: string,
): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();

  const { error } = await supabase
    .from("assessment_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("teacher_id", userId);
  if (error) throw error;
}

// Per-student schedule override (requirement 5) - moves ONE student's
// effective date/time/deadline without touching the assessment's own
// template or any other student's assignment row.
export async function editAssessmentAssignmentScheduleAction(
  assignmentId: string,
  input: {
    scheduledDate?: string | null;
    scheduledTime?: string | null;
    deadlineAt?: string | null;
  },
): Promise<TeacherAssessmentAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("assessment_assignments")
    .select("id, kind")
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That assessment assignment no longer exists");
  }

  const row: Record<string, unknown> = {};
  if (existing.kind === "mock_exam") {
    if (!input.scheduledDate || !isValidDateString(input.scheduledDate)) {
      throw new ExpectedError("Pick a valid exam date");
    }
    if (input.scheduledTime && !TIME_PATTERN.test(input.scheduledTime)) {
      throw new ExpectedError("Enter the exam time as HH:MM");
    }
    row.effective_scheduled_date = input.scheduledDate;
    row.effective_scheduled_time = input.scheduledTime || null;
  } else {
    if (input.deadlineAt && !isValidDateTimeString(input.deadlineAt)) {
      throw new ExpectedError("Pick a valid deadline");
    }
    row.effective_deadline_at = input.deadlineAt || null;
  }

  const { data, error } = await supabase
    .from("assessment_assignments")
    .update(row)
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .single();
  if (error) throw error;

  return toTeacherAssignmentRow(data as unknown as RawAssignmentRow);
}

export async function markAssessmentTakenAction(
  assignmentId: string,
  takenAt?: string,
): Promise<TeacherAssessmentAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("assessment_assignments")
    .select("id, status")
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That assessment assignment no longer exists");
  }
  if (existing.status !== "registered") {
    throw new ExpectedError("This assessment has already been marked taken");
  }
  if (takenAt && !isValidDateTimeString(takenAt)) {
    throw new ExpectedError("Pick a valid date/time");
  }

  const { data, error } = await supabase
    .from("assessment_assignments")
    .update({ status: "taken", taken_at: takenAt || new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .single();
  if (error) throw error;

  return toTeacherAssignmentRow(data as unknown as RawAssignmentRow);
}

export async function enterAssessmentMarkAction(
  assignmentId: string,
  input: { score: number; teacherComment?: string; takenAt?: string },
): Promise<TeacherAssessmentAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("assessment_assignments")
    .select("id, taken_at, assessment_id, assessments:assessment_id (max_score)")
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That assessment assignment no longer exists");
  }

  const maxScore = (
    existing as unknown as { assessments: { max_score: number } }
  ).assessments.max_score;
  if (input.score < 0 || input.score > maxScore) {
    throw new ExpectedError(`Score must be between 0 and ${maxScore}`);
  }
  if (input.takenAt && !isValidDateTimeString(input.takenAt)) {
    throw new ExpectedError("Pick a valid date/time");
  }

  // taken_at is set once and never overwritten again (see
  // lib/assessment-status.ts) - only fill it in here if this is the first
  // time the assignment is being taken/graded.
  const takenAt = existing.taken_at ?? input.takenAt ?? new Date().toISOString();

  const { data, error } = await supabase
    .from("assessment_assignments")
    .update({
      status: "marked",
      score: input.score,
      teacher_comment: input.teacherComment?.trim() || null,
      taken_at: takenAt,
    })
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .single();
  if (error) throw error;

  return toTeacherAssignmentRow(data as unknown as RawAssignmentRow);
}

// Reverts a graded assignment back to 'taken' - deliberately never touches
// taken_at, so clearing a mark can't erase the "was this taken late"
// history the whole feature is built to preserve.
export async function clearAssessmentMarkAction(
  assignmentId: string,
): Promise<TeacherAssessmentAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("assessment_assignments")
    .select("id, status")
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That assessment assignment no longer exists");
  }
  if (existing.status !== "marked") {
    throw new ExpectedError("This assessment hasn't been marked yet");
  }

  const { data, error } = await supabase
    .from("assessment_assignments")
    .update({ status: "taken", score: null, teacher_comment: null })
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .single();
  if (error) throw error;

  return toTeacherAssignmentRow(data as unknown as RawAssignmentRow);
}
