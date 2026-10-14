import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { ProjectionEvent } from "@/lib/calendar-projection";
import type { AttendanceStatus } from "@/lib/attendance-records";
import type { Homework } from "@/lib/types/database";
import {
  addDays,
  buildDayLessons,
  classHasLessonOn,
  neighbouringLessonDays,
  nextLessonDay,
  type DayLesson,
  type DayProjection,
} from "@/lib/teacher-app/day";

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

export type CompanionStudent = {
  id: string;
  firstName: string;
  lastName: string;
  gradeLevel: string;
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
  withdrawn_at: string | null;
  student_class_assignments: { class_id: string }[] | null;
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
        "id, event_type, event_date, start_time, end_time, class_id, class_name, student_id, student_name, contact_name, title, notes",
      )
      .eq("teacher_id", teacherId)
      .gte("event_date", from)
      .lte("event_date", to),
    supabase
      .from("students")
      .select("id, first_name, last_name, grade_level, withdrawn_at, student_class_assignments(class_id)")
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

function activeClasses(classes: ClassRow[]): CompanionClass[] {
  return classes
    .filter((row) => !row.archived_at)
    .map((row) => ({ id: row.id, name: row.name, billingType: row.billing_type }));
}

export type CompanionDay = {
  date: string;
  lessons: DayLesson[];
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
    .select("class_id, student_id, status")
    .eq("teacher_id", teacherId)
    .eq("attendance_date", date);
  if (error) throw error;

  return {
    date,
    lessons: buildDayLessons({
      date,
      projection,
      rosterByClass: rostersByClass(students),
      attendance: attendance ?? [],
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

  const { data: rows, error } = await supabase
    .from("attendance_records")
    .select("student_id, status, family_balance_transactions(amount)")
    .eq("teacher_id", teacherId)
    .eq("class_id", classId)
    .eq("attendance_date", date);
  if (error) throw error;

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
  };
}

export type CompanionHomework = Pick<Homework, "id" | "class_id" | "note" | "due_date" | "created_at">;

export type CompanionHomeworkView = {
  classes: CompanionClass[];
  /** Classes with a lesson today, in lesson order - shown first in the picker. */
  todayClassIds: string[];
  selectedClassId: string | null;
  homework: CompanionHomework[];
  /** The selected class's next lesson day after today, for the due-date chip. */
  nextLessonDate: string | null;
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
    nextLessonDate: selectedClassId ? nextLessonDay(selectedClassId, today, projection) : null,
  };
}
