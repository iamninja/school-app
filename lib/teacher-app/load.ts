import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { ProjectionEvent } from "@/lib/calendar-projection";
import type { AttendanceStatus } from "@/lib/attendance-records";
import type {
  Assessment,
  AssessmentAssignment,
  Homework,
  TeacherAssessmentAssignmentRow,
} from "@/lib/types/database";
import { isAssessmentAssignmentLate } from "@/lib/assessment-status";
import {
  groupTests,
  overdueCount,
  type TestsAssessment,
  type TestsAssignment,
  type TestsGroups,
} from "@/lib/teacher-app/assessments";
import type { SchoolBreakItem } from "@/lib/school-closures";
import { projectOccurrences } from "@/lib/calendar-projection";
import { athensToday } from "@/lib/push/athens-time";
import {
  TEACHER_TASK_COLUMNS,
  groupDayTasks,
  lessonRefFor,
  lessonRefKey,
  overdueTasks as overdueTasksOf,
  anytimeDueOn,
  anytimeTasks as anytimeTasksOf,
  taskProgress,
  type LessonRef,
  type TeacherTask,
} from "@/lib/teacher-tasks";
import {
  addDays,
  buildDayEventLessons,
  buildDayHolidays,
  buildDayLessons,
  classHasLessonOn,
  neighbouringLessonDays,
  nextLessonDays,
  type DayAttendanceRow,
  type DayEventLesson,
  type DayLesson,
  type DayProjection,
} from "@/lib/teacher-app/day";
import { normalizeGreekPhone } from "@/lib/teacher-app/phone";
import { lessonTimeLabel, timeToMinutes } from "@/lib/schedule-grid";

/**
 * Small, focused reads for the phone companion (/teacher-app) - instead of
 * the console's whole-school load in app/protected/teacher/page.tsx. Every
 * query is scoped by teacher_id; callers have already checked the teacher.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type CompanionClass = {
  id: string;
  name: string;
  billingType: string | null;
};

export type CompanionContact = {
  /** "Mother", "Parent", "Student" … - the parent's name when there is one. */
  name: string;
  role: "parent" | "student" | "contact";
  /** E.164, e.g. +306912345678. */
  phone: string;
};

export type CompanionStudent = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
  /** Primary parent first, then other parents, then the student; only usable numbers. */
  contacts?: CompanionContact[];
};

type ClassRow = {
  id: string;
  name: string;
  archived_at: string | null;
  start_date: string | null;
  finish_date: string | null;
  billing_type: string | null;
};

type SlotRow = {
  day: string;
  time: string;
  class_id: string;
  is_two_hour: boolean | null;
  end_time: string | null;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  grade_level: string | null;
  phone: string | null;
  withdrawn_at: string | null;
  student_class_assignments: { class_id: string }[] | null;
  // A forward embed (many students → one family): an object, not an array,
  // at runtime - see the same note in app/protected/teacher/page.tsx.
  families: {
    family_parents: { name: string | null; phone: string | null; is_primary: boolean }[] | null;
  } | null;
};

async function loadSchool(
  supabase: SupabaseServerClient,
  teacherId: string,
  from: string,
  to: string,
): Promise<{ classes: ClassRow[]; projection: DayProjection; students: StudentRow[] }> {
  const [classes, slots, events, students] = await Promise.all([
    supabase
      .from("classes")
      .select("id, name, archived_at, start_date, finish_date, billing_type")
      .eq("teacher_id", teacherId)
      .order("name", { ascending: true }),
    supabase
      .from("class_schedule_slots")
      .select("day, time, class_id, is_two_hour, end_time")
      .eq("teacher_id", teacherId),
    supabase
      .from("calendar_events")
      .select(
        "id, event_type, event_date, start_time, end_time, class_id, class_name, student_id, student_name, contact_name, title, notes, cancellation_reason, closure_id, closure_from, closure_to, trial_outcome",
      )
      .eq("teacher_id", teacherId)
      .gte("event_date", from)
      .lte("event_date", to),
    supabase
      .from("students")
      .select(
        "id, first_name, last_name, grade_level, phone, withdrawn_at, student_class_assignments(class_id), families(family_parents(name, phone, is_primary))",
      )
      .eq("teacher_id", teacherId)
      .is("withdrawn_at", null)
      .order("last_name", { ascending: true }),
  ]);
  for (const result of [classes, slots, events, students]) {
    if (result.error) throw result.error;
  }

  const classRows = (classes.data ?? []) as ClassRow[];
  return {
    classes: classRows,
    students: (students.data ?? []) as unknown as StudentRow[],
    projection: {
      classes: classRows.map((row) => ({
        id: row.id,
        name: row.name,
        archivedAt: row.archived_at,
        startDate: row.start_date,
        finishDate: row.finish_date,
      })),
      slots: ((slots.data ?? []) as SlotRow[]).map((slot) => ({
        classId: slot.class_id,
        day: slot.day,
        time: slot.time,
        isTwoHour: Boolean(slot.is_two_hour),
        endTime: slot.end_time,
      })),
      events: (events.data ?? []) as ProjectionEvent[],
    },
  };
}

function rostersByClass(students: StudentRow[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const student of students) {
    for (const { class_id } of student.student_class_assignments ?? []) {
      const set = map.get(class_id) ?? new Set<string>();
      set.add(student.id);
      map.set(class_id, set);
    }
  }
  return map;
}

function contactsFor(student: StudentRow): CompanionContact[] {
  const parents = [...(student.families?.family_parents ?? [])].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary),
  );
  const contacts: CompanionContact[] = [];
  for (const parent of parents) {
    const phone = normalizeGreekPhone(parent.phone);
    if (phone) contacts.push({ name: parent.name?.trim() || "Parent", role: "parent", phone });
  }
  const own = normalizeGreekPhone(student.phone);
  if (own) contacts.push({ name: student.first_name, role: "student", phone: own });
  return contacts;
}

function activeClasses(classes: ClassRow[]): CompanionClass[] {
  return classes
    .filter((row) => !row.archived_at)
    .map((row) => ({ id: row.id, name: row.name, billingType: row.billing_type }));
}

export type CompanionDay = {
  date: string;
  lessons: DayLesson[];
  /** Holidays that day, shown as one block each instead of their lessons. */
  holidays: SchoolBreakItem[];
  /** One-off and trial lessons that day (no class, so not in `lessons`). */
  eventLessons: DayEventLesson[];
  /**
   * Task counts per Today row: `class:<classId>` (all of that class's
   * lessons that day - one row per class) or `event:<eventId>`.
   */
  lessonTaskCounts: Record<string, { done: number; total: number }>;
  /** The day's own to-dos, plus lesson tasks whose lesson isn't on it any more. */
  dayTasks: TeacherTask[];
  /** Still-open tasks from earlier days, and anytime ones past due (only on today). */
  overdueTasks: TeacherTask[];
  /** Tasks with no day: open ones, and ones done in the last two weeks. */
  anytimeTasks: TeacherTask[];
  /** Open anytime tasks due on this day. */
  dueAnytime: TeacherTask[];
  previous: string | null;
  next: string | null;
};

export async function loadDay(
  supabase: SupabaseServerClient,
  teacherId: string,
  date: string,
): Promise<CompanionDay> {
  const { projection, students } = await loadSchool(
    supabase,
    teacherId,
    addDays(date, -21),
    addDays(date, 21),
  );
  const { data: attendance, error } = await supabase
    .from("attendance_records")
    .select("class_id, calendar_event_id, student_id, status")
    .eq("teacher_id", teacherId)
    .eq("attendance_date", date);
  if (error) throw error;
  const rows = (attendance ?? []) as Array<
    DayAttendanceRow & { calendar_event_id: string | null }
  >;

  const today = athensToday();
  const tasks = await loadTasks(supabase, teacherId, date, date === today ? today : null);
  const occurrences = projectOccurrences({ from: date, to: date, ...projection, includeBlocks: false });
  const grouped = groupDayTasks(tasks, date, occurrences);
  const lessonTaskCounts: Record<string, { done: number; total: number }> = {};
  for (const occurrence of occurrences) {
    const ref = lessonRefFor(occurrence);
    if (!ref) continue;
    const list = grouped.byLesson.get(lessonRefKey(ref));
    if (!list) continue;
    // A class meeting twice that day is one Today row: add its slots up.
    const rowKey =
      occurrence.classId && occurrence.kind !== "ad_hoc_lesson" && occurrence.kind !== "trial_lesson"
        ? `class:${occurrence.classId}`
        : `event:${occurrence.eventId}`;
    const counts = lessonTaskCounts[rowKey] ?? { done: 0, total: 0 };
    const progress = taskProgress(list);
    lessonTaskCounts[rowKey] = {
      done: counts.done + progress.done,
      total: counts.total + progress.total,
    };
  }

  return {
    date,
    lessons: buildDayLessons({
      date,
      projection,
      rosterByClass: rostersByClass(students),
      attendance: rows.filter((row) => row.calendar_event_id === null),
    }),
    holidays: buildDayHolidays({ date, projection }),
    lessonTaskCounts,
    dayTasks: [...grouped.personal, ...grouped.unlinked],
    overdueTasks: date === today ? overdueTasksOf(tasks, today) : [],
    anytimeTasks: anytimeTasksOf(tasks),
    dueAnytime: anytimeDueOn(tasks, date),
    eventLessons: buildDayEventLessons({
      date,
      projection,
      statusByEventId: new Map(
        rows
          .filter((row) => row.calendar_event_id !== null)
          .map((row) => [row.calendar_event_id!, row.status]),
      ),
    }),
    ...neighbouringLessonDays({ date, projection }),
  };
}

export type CompanionLesson = {
  date: string;
  classItem: CompanionClass;
  /** False when the class has no lesson that day (opened from an old link). */
  hasLesson: boolean;
  isTwoHour: boolean;
  timeLabel: string | null;
  roster: CompanionStudent[];
  statuses: Record<string, { status: AttendanceStatus; chargedAmount: number | null }>;
  /** The class's most recently set homework, shown above the roster. */
  lastHomework: CompanionHomework | null;
};

// family_balance_transactions is the "many" side of the embed, so it comes
// back as an array - same collapse as getAttendanceAction's toChargedAmount.
function toChargedAmount(transactions: unknown): number | null {
  const rows = transactions as Array<{ amount: string | number }> | null;
  const amount = rows?.[0]?.amount;
  return amount === undefined ? null : Number(amount);
}

export async function loadLesson(
  supabase: SupabaseServerClient,
  teacherId: string,
  classId: string,
  date: string,
): Promise<CompanionLesson | null> {
  const { classes, projection, students } = await loadSchool(supabase, teacherId, date, date);
  const classRow = classes.find((row) => row.id === classId && !row.archived_at);
  if (!classRow) return null;

  const [{ data: rows, error }, { data: homeworkRows, error: homeworkError }] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("student_id, status, family_balance_transactions(amount)")
      .eq("teacher_id", teacherId)
      .eq("class_id", classId)
      .eq("attendance_date", date),
    supabase
      .from("homework")
      .select("id, class_id, note, due_date, created_at")
      .eq("teacher_id", teacherId)
      .eq("class_id", classId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (error) throw error;
  if (homeworkError) throw homeworkError;

  const occurrence = classHasLessonOn(classId, date, projection);
  const lessons = buildDayLessons({
    date,
    projection,
    rosterByClass: new Map(),
    attendance: [],
  });
  const lesson = lessons.find((item) => item.classId === classId);

  return {
    date,
    classItem: { id: classRow.id, name: classRow.name, billingType: classRow.billing_type },
    hasLesson: occurrence !== null,
    isTwoHour: occurrence?.isTwoHour ?? false,
    timeLabel: lesson?.kind === "cancelled" ? null : (lesson?.timeLabel ?? null),
    roster: students
      .filter((student) =>
        (student.student_class_assignments ?? []).some((a) => a.class_id === classId),
      )
      .map((student) => ({
        id: student.id,
        firstName: student.first_name,
        lastName: student.last_name,
        gradeLevel: student.grade_level ?? "",
        contacts: contactsFor(student),
      })),
    statuses: Object.fromEntries(
      (rows ?? []).map((row) => [
        row.student_id,
        {
          status: row.status as AttendanceStatus,
          chargedAmount: toChargedAmount(row.family_balance_transactions),
        },
      ]),
    ),
    lastHomework: ((homeworkRows ?? []) as CompanionHomework[])[0] ?? null,
  };
}

export type CompanionHomework = Pick<Homework, "id" | "class_id" | "note" | "due_date" | "created_at">;

export type CompanionHomeworkView = {
  classes: CompanionClass[];
  /** Classes with a lesson today, in lesson order - shown first in the picker. */
  todayClassIds: string[];
  selectedClassId: string | null;
  homework: CompanionHomework[];
  /** The selected class's next three lesson days after today, for the due-date chips. */
  nextLessonDates: string[];
};

export async function loadHomeworkView(
  supabase: SupabaseServerClient,
  teacherId: string,
  today: string,
  requestedClassId: string | null,
): Promise<CompanionHomeworkView> {
  const { classes, projection } = await loadSchool(supabase, teacherId, today, addDays(today, 60));
  const active = activeClasses(classes);
  const todayClassIds = buildDayLessons({
    date: today,
    projection,
    rosterByClass: new Map(),
    attendance: [],
  })
    .filter((lesson) => lesson.kind !== "cancelled")
    .map((lesson) => lesson.classId)
    .filter((id) => active.some((item) => item.id === id));

  const selectedClassId =
    (requestedClassId && active.some((item) => item.id === requestedClassId)
      ? requestedClassId
      : null) ??
    todayClassIds[0] ??
    active[0]?.id ??
    null;

  let homework: CompanionHomework[] = [];
  if (selectedClassId) {
    const { data, error } = await supabase
      .from("homework")
      .select("id, class_id, note, due_date, created_at")
      .eq("teacher_id", teacherId)
      .eq("class_id", selectedClassId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    homework = (data ?? []) as CompanionHomework[];
  }

  return {
    classes: active,
    todayClassIds,
    selectedClassId,
    homework,
    nextLessonDates: selectedClassId ? nextLessonDays(selectedClassId, today, projection) : [],
  };
}

export type CompanionOneOffLesson = {
  eventId: string;
  date: string;
  timeLabel: string | null;
  isTwoHour: boolean;
  /** Charged at the lesson's own price when set. */
  isCharged: boolean;
  /** The one student - null if they were withdrawn or deleted since. */
  student: CompanionStudent | null;
  studentName: string;
  statuses: Record<string, { status: AttendanceStatus; chargedAmount: number | null }>;
};

/** One one-off lesson, for its one-student attendance screen. */
export async function loadOneOffLesson(
  supabase: SupabaseServerClient,
  teacherId: string,
  eventId: string,
): Promise<CompanionOneOffLesson | null> {
  const { data: event, error } = await supabase
    .from("calendar_events")
    .select("id, event_date, start_time, end_time, student_id, student_name, lesson_price")
    .eq("id", eventId)
    .eq("teacher_id", teacherId)
    .eq("event_type", "ad_hoc_lesson")
    .maybeSingle();
  if (error) throw error;
  if (!event) return null;

  const [{ students }, { data: rows, error: rowsError }] = await Promise.all([
    loadSchool(supabase, teacherId, event.event_date, event.event_date),
    supabase
      .from("attendance_records")
      .select("student_id, status, family_balance_transactions(amount)")
      .eq("teacher_id", teacherId)
      .eq("calendar_event_id", eventId),
  ]);
  if (rowsError) throw rowsError;

  const studentRow = students.find((student) => student.id === event.student_id);
  const startTime = event.start_time as string | null;
  const endTime = event.end_time as string | null;
  const isTwoHour =
    !!startTime && !!endTime && timeToMinutes(endTime) - timeToMinutes(startTime) >= 120;
  return {
    eventId,
    date: event.event_date,
    timeLabel: startTime ? lessonTimeLabel(startTime, isTwoHour, endTime) : null,
    isTwoHour,
    isCharged: event.lesson_price != null,
    student: studentRow
      ? {
          id: studentRow.id,
          firstName: studentRow.first_name,
          lastName: studentRow.last_name,
          gradeLevel: studentRow.grade_level ?? "",
          contacts: contactsFor(studentRow),
        }
      : null,
    studentName: event.student_name ?? "",
    statuses: Object.fromEntries(
      (rows ?? []).map((row) => [
        row.student_id,
        {
          status: row.status as AttendanceStatus,
          chargedAmount: toChargedAmount(row.family_balance_transactions),
        },
      ]),
    ),
  };
}

// Done anytime tasks stay listed this long (same as listTasksAction).
const ANYTIME_DONE_DAYS = 14;

/**
 * A day's tasks and the Anytime list, plus - when `overdueBefore` is given
 * - every still-open task from before that date.
 */
async function loadTasks(
  supabase: SupabaseServerClient,
  teacherId: string,
  date: string,
  overdueBefore: string | null,
  withAnytime = true,
): Promise<TeacherTask[]> {
  const doneSince = new Date(Date.now() - ANYTIME_DONE_DAYS * 86_400_000).toISOString();
  const [onDay, overdue, anytime] = await Promise.all([
    supabase
      .from("teacher_tasks")
      .select(TEACHER_TASK_COLUMNS)
      .eq("teacher_id", teacherId)
      .eq("task_date", date),
    overdueBefore
      ? supabase
          .from("teacher_tasks")
          .select(TEACHER_TASK_COLUMNS)
          .eq("teacher_id", teacherId)
          .is("done_at", null)
          .lt("task_date", overdueBefore)
      : Promise.resolve({ data: [], error: null }),
    withAnytime
      ? supabase
          .from("teacher_tasks")
          .select(TEACHER_TASK_COLUMNS)
          .eq("teacher_id", teacherId)
          .is("task_date", null)
          .or(`done_at.is.null,done_at.gte.${doneSince}`)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (onDay.error) throw onDay.error;
  if (overdue.error) throw overdue.error;
  if (anytime.error) throw anytime.error;
  return [
    ...((onDay.data ?? []) as unknown as TeacherTask[]),
    ...((overdue.data ?? []) as unknown as TeacherTask[]),
    ...((anytime.data ?? []) as unknown as TeacherTask[]),
  ];
}

export type CompanionLessonTasks = {
  /** Where a new task for this lesson goes (null: the lesson isn't on the day). */
  lessonRef: LessonRef | null;
  tasks: TeacherTask[];
};

/**
 * One lesson's tasks on a date: a class's (all of its lessons that day,
 * like its single Today row) or one event's (one-off, trial).
 */
export async function loadLessonTasks(
  supabase: SupabaseServerClient,
  teacherId: string,
  date: string,
  lesson: { classId: string } | { eventId: string },
): Promise<CompanionLessonTasks> {
  const [{ projection }, tasks] = await Promise.all([
    loadSchool(supabase, teacherId, date, date),
    loadTasks(supabase, teacherId, date, null, false),
  ]);
  const occurrences = projectOccurrences({ from: date, to: date, ...projection, includeBlocks: false })
    .filter((occurrence) =>
      "eventId" in lesson
        ? occurrence.eventId === lesson.eventId
        : occurrence.classId === lesson.classId &&
          (occurrence.kind === "recurring" ||
            occurrence.kind === "extra_session" ||
            occurrence.kind === "cancelled"),
    );
  const grouped = groupDayTasks(tasks, date, occurrences);
  const refs = occurrences
    .map(lessonRefFor)
    .filter((ref): ref is LessonRef => ref !== null);
  // New tasks go to the day's first lesson that still happens.
  const live = occurrences.find((occurrence) => occurrence.kind !== "cancelled");
  return {
    lessonRef: live ? lessonRefFor(live) : (refs[0] ?? null),
    tasks: refs.flatMap((ref) => grouped.byLesson.get(lessonRefKey(ref)) ?? []),
  };
}

const TESTS_ASSIGNMENT_COLUMNS =
  "assessment_id, status, effective_scheduled_date, effective_scheduled_time, effective_deadline_at";

/** Tests tab: every assessment with its students' states, sorted into groups. */
export async function loadTestsView(
  supabase: SupabaseServerClient,
  teacherId: string,
  today: string,
): Promise<TestsGroups> {
  const [{ data: assessments, error: assessmentsError }, { data: rows, error: rowsError }] =
    await Promise.all([
      supabase
        .from("assessments")
        .select("id, kind, title, class_name, max_score")
        .eq("teacher_id", teacherId),
      supabase
        .from("assessment_assignments")
        .select(TESTS_ASSIGNMENT_COLUMNS)
        .eq("teacher_id", teacherId),
    ]);
  if (assessmentsError) throw assessmentsError;
  if (rowsError) throw rowsError;
  return groupTests(
    (assessments ?? []) as TestsAssessment[],
    (rows ?? []) as TestsAssignment[],
    today,
  );
}

/** The Tests tab's badge - students overdue to take a test. */
export async function loadTestsBadge(
  supabase: SupabaseServerClient,
  teacherId: string,
  today: string,
): Promise<number> {
  const [{ data: assessments, error: assessmentsError }, { data: rows, error: rowsError }] =
    await Promise.all([
      supabase.from("assessments").select("id, kind").eq("teacher_id", teacherId),
      supabase
        .from("assessment_assignments")
        .select(TESTS_ASSIGNMENT_COLUMNS)
        .eq("teacher_id", teacherId)
        .eq("status", "registered"),
    ]);
  if (assessmentsError) throw assessmentsError;
  if (rowsError) throw rowsError;
  return overdueCount(
    (assessments ?? []) as Pick<TestsAssessment, "id" | "kind">[],
    (rows ?? []) as TestsAssignment[],
    today,
  );
}

export type CompanionAssessment = Pick<
  Assessment,
  | "id"
  | "kind"
  | "title"
  | "description"
  | "max_score"
  | "duration_minutes"
  | "scheduled_date"
  | "scheduled_time"
  | "deadline_at"
  | "class_name"
  | "notifications_disabled"
>;

export type CompanionAssessmentView = {
  assessment: CompanionAssessment;
  /** By last name, then first. */
  roster: TeacherAssessmentAssignmentRow[];
};

/** One assessment's roster for marking "taken" - null if it isn't the teacher's. */
export async function loadTestsAssessment(
  supabase: SupabaseServerClient,
  teacherId: string,
  assessmentId: string,
): Promise<CompanionAssessmentView | null> {
  const [{ data: assessment, error: assessmentError }, { data: rows, error: rowsError }] =
    await Promise.all([
      supabase
        .from("assessments")
        .select(
          "id, kind, title, description, max_score, duration_minutes, scheduled_date, " +
            "scheduled_time, deadline_at, class_name, notifications_disabled",
        )
        .eq("teacher_id", teacherId)
        .eq("id", assessmentId)
        .maybeSingle(),
      supabase
        .from("assessment_assignments")
        .select(
          "id, assessment_id, student_id, kind, effective_scheduled_date, effective_scheduled_time, " +
            "effective_deadline_at, taken_at, status, score, teacher_comment, graded_paper_url, " +
            "created_at, students:student_id (first_name, last_name)",
        )
        .eq("teacher_id", teacherId)
        .eq("assessment_id", assessmentId),
    ]);
  if (assessmentError) throw assessmentError;
  if (rowsError) throw rowsError;
  if (!assessment) return null;

  type Row = AssessmentAssignment & {
    students: { first_name: string; last_name: string } | null;
  };
  const roster = ((rows ?? []) as unknown as Row[])
    .map(({ students, ...row }) => ({
      row: {
        ...row,
        studentName: students ? `${students.first_name} ${students.last_name}`.trim() : "",
        isLate: isAssessmentAssignmentLate({
          kind: row.kind,
          effectiveScheduledDate: row.effective_scheduled_date,
          effectiveScheduledTime: row.effective_scheduled_time,
          effectiveDeadlineAt: row.effective_deadline_at,
          takenAt: row.taken_at,
        }),
      },
      sortKey: students ? `${students.last_name} ${students.first_name}` : "",
    }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey, "el"))
    .map(({ row }) => row);

  return { assessment: assessment as unknown as CompanionAssessment, roster };
}
