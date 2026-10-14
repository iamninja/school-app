import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/push/notify";
import { loadNotificationSettings } from "@/lib/push/settings";
import {
  addDaysToDate,
  athensMinutesNow,
  athensToday,
  formatShortDateEl,
} from "@/lib/push/athens-time";
import type { ProjectionEvent } from "@/lib/calendar-projection";
import { buildDayLessons, type DayLesson } from "@/lib/teacher-app/day";

/**
 * "Attendance not taken" alerts for the teacher:
 *   - during the lesson, once it has run IN_LESSON_AFTER_MINUTES with nobody
 *     marked (needs the frequent scheduler, /api/cron/notifications);
 *   - a summary of the day's lessons that ended unmarked, at the evening run,
 *     and of yesterday's that the evening run couldn't see yet (they ended
 *     later), at the morning run.
 * "Unmarked" = the class has students and none of them has a mark that day.
 * attendance_alerts makes each alert fire once. Never throws.
 */

export const IN_LESSON_AFTER_MINUTES = 20;
// Past this long after the lesson's end, the in-lesson alert is pointless;
// the summary covers it instead.
const IN_LESSON_UNTIL_AFTER_END_MINUTES = 15;

type ClassRow = {
  id: string;
  name: string;
  archived_at: string | null;
  start_date: string | null;
  finish_date: string | null;
};

async function lessonsOn(supabase: SupabaseClient, date: string): Promise<DayLesson[]> {
  const [classes, slots, events, students, attendance] = await Promise.all([
    supabase.from("classes").select("id, name, archived_at, start_date, finish_date"),
    supabase.from("class_schedule_slots").select("day, time, class_id, is_two_hour, end_time"),
    supabase
      .from("calendar_events")
      .select(
        "id, event_type, event_date, start_time, end_time, class_id, class_name, student_id, student_name, contact_name, title, notes",
      )
      .eq("event_date", date),
    supabase
      .from("students")
      .select("id, student_class_assignments(class_id)")
      .is("withdrawn_at", null),
    supabase
      .from("attendance_records")
      .select("class_id, student_id, status")
      .eq("attendance_date", date),
  ]);
  for (const result of [classes, slots, events, students, attendance]) {
    if (result.error) throw result.error;
  }

  const rosterByClass = new Map<string, Set<string>>();
  for (const student of (students.data ?? []) as {
    id: string;
    student_class_assignments: { class_id: string }[] | null;
  }[]) {
    for (const { class_id } of student.student_class_assignments ?? []) {
      const roster = rosterByClass.get(class_id) ?? new Set<string>();
      roster.add(student.id);
      rosterByClass.set(class_id, roster);
    }
  }

  return buildDayLessons({
    date,
    projection: {
      classes: ((classes.data ?? []) as ClassRow[]).map((row) => ({
        id: row.id,
        name: row.name,
        archivedAt: row.archived_at,
        startDate: row.start_date,
        finishDate: row.finish_date,
      })),
      slots: (
        (slots.data ?? []) as {
          day: string;
          time: string;
          class_id: string;
          is_two_hour: boolean | null;
          end_time: string | null;
        }[]
      ).map((slot) => ({
        classId: slot.class_id,
        day: slot.day,
        time: slot.time,
        isTwoHour: Boolean(slot.is_two_hour),
        endTime: slot.end_time,
      })),
      events: (events.data ?? []) as ProjectionEvent[],
    },
    rosterByClass,
    attendance: (attendance.data ?? []) as { class_id: string; student_id: string; status: string }[],
  });
}

function isUnmarked(lesson: DayLesson): boolean {
  return lesson.kind !== "cancelled" && lesson.rosterSize > 0 && lesson.marked === 0;
}

function minutesToTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Claims `column` (alerted_at / summarized_at) for these lessons; returns the
 * class ids this run got - another overlapping run gets none of them.
 */
async function claim(
  supabase: SupabaseClient,
  column: "alerted_at" | "summarized_at",
  date: string,
  classIds: string[],
  now: Date,
): Promise<Set<string>> {
  if (classIds.length === 0) return new Set();
  await supabase
    .from("attendance_alerts")
    .upsert(
      classIds.map((classId) => ({ class_id: classId, lesson_date: date })),
      { onConflict: "class_id,lesson_date", ignoreDuplicates: true },
    );
  const { data } = await supabase
    .from("attendance_alerts")
    .update({ [column]: now.toISOString() })
    .eq("lesson_date", date)
    .in("class_id", classIds)
    .is(column, null)
    .select("class_id");
  return new Set((data ?? []).map((row) => row.class_id as string));
}

async function guarded(job: string, work: () => Promise<number>): Promise<number> {
  try {
    return await work();
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { feature: "push-notifications", job } });
    return 0;
  }
}

/** Lessons running for a while with nobody marked. Returns alerts sent. */
export function sendInLessonAttendanceAlerts(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<number> {
  return guarded("attendance_in_lesson", async () => {
    const settings = await loadNotificationSettings(supabase);
    if (!settings.teacher_attendance_missing) return 0;

    const today = athensToday(now);
    const minutes = athensMinutesNow(now);
    const due = (await lessonsOn(supabase, today)).filter(
      (lesson) =>
        isUnmarked(lesson) &&
        lesson.startMinutes !== null &&
        lesson.endMinutes !== null &&
        minutes >= lesson.startMinutes + IN_LESSON_AFTER_MINUTES &&
        minutes <= lesson.endMinutes + IN_LESSON_UNTIL_AFTER_END_MINUTES,
    );
    const claimed = await claim(
      supabase,
      "alerted_at",
      today,
      due.map((lesson) => lesson.classId),
      now,
    );

    let sent = 0;
    for (const lesson of due.filter((item) => claimed.has(item.classId))) {
      await notify({
        event: "teacher_attendance_missing",
        to: { kind: "teachers" },
        values: { class: lesson.className, time: minutesToTime(lesson.startMinutes ?? 0) },
        url: `/teacher-app/lesson/${lesson.classId}?date=${today}`,
        tag: `attendance-${lesson.classId}-${today}`,
        supabase,
        now,
      });
      sent += 1;
    }
    return sent;
  });
}

/**
 * One summary of `date`'s lessons that ended with nobody marked and weren't
 * in an earlier summary. The evening run passes today, the morning run
 * yesterday. Returns how many lessons it listed.
 */
export function sendAttendanceSummary(
  supabase: SupabaseClient,
  date: string,
  now: Date = new Date(),
): Promise<number> {
  return guarded("attendance_summary", async () => {
    const settings = await loadNotificationSettings(supabase);
    if (!settings.teacher_attendance_missing) return 0;

    const today = athensToday(now);
    if (date > today) return 0;
    const minutes = athensMinutesNow(now);
    const ended = (await lessonsOn(supabase, date)).filter(
      (lesson) =>
        isUnmarked(lesson) &&
        (date < today || (lesson.endMinutes !== null && lesson.endMinutes <= minutes)),
    );
    const claimed = await claim(
      supabase,
      "summarized_at",
      date,
      ended.map((lesson) => lesson.classId),
      now,
    );
    const listed = ended.filter((lesson) => claimed.has(lesson.classId));
    if (listed.length === 0) return 0;

    await notify({
      event: "teacher_attendance_summary",
      to: { kind: "teachers" },
      values: {
        date: formatShortDateEl(date),
        lessons: listed
          .map((lesson) =>
            lesson.startMinutes === null
              ? lesson.className
              : `${lesson.className} (${minutesToTime(lesson.startMinutes)})`,
          )
          .join(", "),
      },
      url: date === today ? "/teacher-app" : `/teacher-app?date=${date}`,
      tag: `attendance-summary-${date}`,
      supabase,
      now,
    });
    return listed.length;
  });
}

/** The morning run's catch-up: yesterday's lessons the evening run missed. */
export function sendYesterdayAttendanceSummary(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<number> {
  return sendAttendanceSummary(supabase, addDaysToDate(athensToday(now), -1), now);
}
