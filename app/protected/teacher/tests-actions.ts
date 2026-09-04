"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { isTestAssignmentLate } from "@/lib/test-status";
import type {
  Test,
  TestInput,
  TeacherTestAssignmentRow,
  TeacherTestListItem,
  TestAssignmentStatus,
} from "@/lib/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const TEST_COLUMNS =
  "id, kind, title, description, max_score, duration_minutes, scheduled_date, " +
  "scheduled_time, deadline_at, class_id, class_name, created_at";

const ASSIGNMENT_COLUMNS =
  "id, test_id, student_id, kind, effective_scheduled_date, effective_scheduled_time, " +
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
  test_id: string;
  student_id: string;
  kind: "short_test" | "mock_exam";
  effective_scheduled_date: string | null;
  effective_scheduled_time: string | null;
  effective_deadline_at: string | null;
  taken_at: string | null;
  status: TestAssignmentStatus;
  score: number | null;
  teacher_comment: string | null;
  created_at: string;
  students: { first_name: string; last_name: string } | null;
};

function toTeacherAssignmentRow(row: RawAssignmentRow): TeacherTestAssignmentRow {
  return {
    id: row.id,
    test_id: row.test_id,
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
    isLate: isTestAssignmentLate({
      kind: row.kind,
      effectiveScheduledDate: row.effective_scheduled_date,
      effectiveScheduledTime: row.effective_scheduled_time,
      effectiveDeadlineAt: row.effective_deadline_at,
      takenAt: row.taken_at,
    }),
  };
}

// Validates kind-specific fields and returns the tests-table row shape
// (minus class_id/class_name, which the caller resolves separately since
// only createTestAction/updateTestAction need the ownership lookup that
// produces them). Shared so create/update can't drift out of sync with
// each other or with the DB's own shape/duration CHECK constraints -
// these checks exist to turn a raw Postgres constraint violation into a
// readable ExpectedError before it ever reaches the database.
function validateTestFields(input: TestInput): Record<string, unknown> {
  const title = input.title.trim();
  if (!title) {
    throw new ExpectedError("Give the test a title");
  }
  if (!(input.maxScore > 0)) {
    throw new ExpectedError("Max score must be greater than 0");
  }

  if (input.kind === "short_test") {
    if (!(input.durationMinutes > 0 && input.durationMinutes <= 60)) {
      throw new ExpectedError("A short test's duration must be 1-60 minutes");
    }
    if (input.scheduledDate || input.scheduledTime) {
      throw new ExpectedError("A short test doesn't have a scheduled date");
    }
    if (input.deadlineAt && !isValidDateTimeString(input.deadlineAt)) {
      throw new ExpectedError("Pick a valid deadline");
    }
    return {
      kind: "short_test",
      title,
      description: input.description?.trim() || null,
      max_score: input.maxScore,
      duration_minutes: input.durationMinutes,
      scheduled_date: null,
      scheduled_time: null,
      deadline_at: input.deadlineAt || null,
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
  };
}

export async function listTestsAction(): Promise<TeacherTestListItem[]> {
  const { supabase } = await requireTeacherSession();

  const [{ data: tests, error: testsError }, { data: assignments, error: assignmentsError }] =
    await Promise.all([
      supabase
        .from("tests")
        .select(TEST_COLUMNS)
        .order("created_at", { ascending: false }),
      supabase.from("test_assignments").select("test_id, status"),
    ]);

  if (testsError) throw testsError;
  if (assignmentsError) throw assignmentsError;

  const countsByTest = new Map<string, { count: number; marked: number }>();
  for (const row of assignments ?? []) {
    const entry = countsByTest.get(row.test_id) ?? { count: 0, marked: 0 };
    entry.count += 1;
    if (row.status === "marked") entry.marked += 1;
    countsByTest.set(row.test_id, entry);
  }

  return ((tests ?? []) as unknown as Test[]).map((test) => {
    const counts = countsByTest.get(test.id) ?? { count: 0, marked: 0 };
    return { ...test, assignmentCount: counts.count, markedCount: counts.marked };
  });
}

export async function listTestAssignmentsAction(): Promise<
  TeacherTestAssignmentRow[]
> {
  const { supabase } = await requireTeacherSession();

  const { data, error } = await supabase
    .from("test_assignments")
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as unknown as RawAssignmentRow[]).map(
    toTeacherAssignmentRow,
  );
}

export async function createTestAction(input: TestInput): Promise<{
  test: Test;
  assignments: TeacherTestAssignmentRow[];
}> {
  const { supabase, userId } = await requireTeacherSession();

  const hasClass = Boolean(input.classId);
  const hasStudents = Boolean(input.studentIds && input.studentIds.length > 0);
  if (hasClass === hasStudents) {
    throw new ExpectedError("Assign the test to either a class or specific students");
  }

  const row = validateTestFields(input);
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

  const { data: insertedTest, error: testError } = await supabase
    .from("tests")
    .insert(row)
    .select(TEST_COLUMNS)
    .single();
  if (testError) throw testError;
  const test = insertedTest as unknown as Test;

  const assignmentRows = studentIds.map((studentId) => ({
    teacher_id: userId,
    test_id: test.id,
    student_id: studentId,
    kind: row.kind,
    effective_scheduled_date: row.scheduled_date,
    effective_scheduled_time: row.scheduled_time,
    effective_deadline_at: row.deadline_at,
  }));

  const { data: assignments, error: assignmentsError } = await supabase
    .from("test_assignments")
    .insert(assignmentRows)
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT);
  if (assignmentsError) throw assignmentsError;

  return {
    test,
    assignments: ((assignments ?? []) as unknown as RawAssignmentRow[]).map(
      toTeacherAssignmentRow,
    ),
  };
}

// Template-only edit - never touches existing assignments' effective_*
// columns, so a date change here doesn't silently move a test out from
// under a student the teacher already rescheduled individually.
export async function updateTestAction(
  testId: string,
  input: TestInput,
): Promise<Test> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("tests")
    .select("id, kind")
    .eq("id", testId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That test no longer exists");
  }
  if (existing.kind !== input.kind) {
    throw new ExpectedError(
      "A test's kind can't be changed - delete it and create a new one.",
    );
  }

  const row = validateTestFields(input);

  const { data, error } = await supabase
    .from("tests")
    .update(row)
    .eq("id", testId)
    .eq("teacher_id", userId)
    .select(TEST_COLUMNS)
    .single();
  if (error) throw error;

  return data as unknown as Test;
}

export async function deleteTestAction(testId: string): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();

  // test_assignments cascades with its parent test (see the migration) -
  // no separate cleanup needed here.
  const { error } = await supabase
    .from("tests")
    .delete()
    .eq("id", testId)
    .eq("teacher_id", userId);
  if (error) throw error;
}

// The "add a latecomer" flow (requirement 4): defaults the new
// assignment's effective_* from the test's CURRENT template values, same
// as createTestAction's class-roster snapshot does at creation time.
export async function addStudentToTestAction(
  testId: string,
  studentId: string,
): Promise<TeacherTestAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: test, error: testError } = await supabase
    .from("tests")
    .select(
      "id, kind, scheduled_date, scheduled_time, deadline_at",
    )
    .eq("id", testId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (testError || !test) {
    throw new ExpectedError("That test no longer exists");
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
    .from("test_assignments")
    .insert({
      teacher_id: userId,
      test_id: test.id,
      student_id: student.id,
      kind: test.kind,
      effective_scheduled_date: test.scheduled_date,
      effective_scheduled_time: test.scheduled_time,
      effective_deadline_at: test.deadline_at,
    })
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new ExpectedError("This student is already assigned to this test");
    }
    throw error;
  }

  return toTeacherAssignmentRow(data as unknown as RawAssignmentRow);
}

export async function removeStudentFromTestAction(
  assignmentId: string,
): Promise<void> {
  const { supabase, userId } = await requireTeacherSession();

  const { error } = await supabase
    .from("test_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("teacher_id", userId);
  if (error) throw error;
}

// Per-student schedule override (requirement 5) - moves ONE student's
// effective date/time/deadline without touching the test's own template
// or any other student's assignment row.
export async function editTestAssignmentScheduleAction(
  assignmentId: string,
  input: {
    scheduledDate?: string | null;
    scheduledTime?: string | null;
    deadlineAt?: string | null;
  },
): Promise<TeacherTestAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("test_assignments")
    .select("id, kind")
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That test assignment no longer exists");
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
    .from("test_assignments")
    .update(row)
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .single();
  if (error) throw error;

  return toTeacherAssignmentRow(data as unknown as RawAssignmentRow);
}

export async function markTestTakenAction(
  assignmentId: string,
  takenAt?: string,
): Promise<TeacherTestAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("test_assignments")
    .select("id, status")
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That test assignment no longer exists");
  }
  if (existing.status !== "registered") {
    throw new ExpectedError("This test has already been marked taken");
  }
  if (takenAt && !isValidDateTimeString(takenAt)) {
    throw new ExpectedError("Pick a valid date/time");
  }

  const { data, error } = await supabase
    .from("test_assignments")
    .update({ status: "taken", taken_at: takenAt || new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .single();
  if (error) throw error;

  return toTeacherAssignmentRow(data as unknown as RawAssignmentRow);
}

export async function enterTestMarkAction(
  assignmentId: string,
  input: { score: number; teacherComment?: string; takenAt?: string },
): Promise<TeacherTestAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("test_assignments")
    .select("id, taken_at, test_id, tests:test_id (max_score)")
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That test assignment no longer exists");
  }

  const maxScore = (
    existing as unknown as { tests: { max_score: number } }
  ).tests.max_score;
  if (input.score < 0 || input.score > maxScore) {
    throw new ExpectedError(`Score must be between 0 and ${maxScore}`);
  }
  if (input.takenAt && !isValidDateTimeString(input.takenAt)) {
    throw new ExpectedError("Pick a valid date/time");
  }

  // taken_at is set once and never overwritten again (see
  // lib/test-status.ts) - only fill it in here if this is the first time
  // the assignment is being taken/graded.
  const takenAt = existing.taken_at ?? input.takenAt ?? new Date().toISOString();

  const { data, error } = await supabase
    .from("test_assignments")
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
export async function clearTestMarkAction(
  assignmentId: string,
): Promise<TeacherTestAssignmentRow> {
  const { supabase, userId } = await requireTeacherSession();

  const { data: existing, error: fetchError } = await supabase
    .from("test_assignments")
    .select("id, status")
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .maybeSingle();
  if (fetchError || !existing) {
    throw new ExpectedError("That test assignment no longer exists");
  }
  if (existing.status !== "marked") {
    throw new ExpectedError("This test hasn't been marked yet");
  }

  const { data, error } = await supabase
    .from("test_assignments")
    .update({ status: "taken", score: null, teacher_comment: null })
    .eq("id", assignmentId)
    .eq("teacher_id", userId)
    .select(ASSIGNMENT_COLUMNS_WITH_STUDENT)
    .single();
  if (error) throw error;

  return toTeacherAssignmentRow(data as unknown as RawAssignmentRow);
}
