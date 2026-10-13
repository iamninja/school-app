import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/push/notify";
import { loadNotificationSettings } from "@/lib/push/settings";
import {
  athensDateTimeToUtc,
  athensToday,
  formatShortDateEl,
} from "@/lib/push/athens-time";
import { classLessons } from "@/lib/push/class-lessons";

/**
 * Absence notices: when a student is marked absent ("Απουσία" only - late
 * counts as present, and 1+1 isn't an absence), the student and their
 * parents are told. Only marks saved on the lesson's own day notify;
 * marking a past lesson is a record correction, not news.
 *
 * Two timings (App tab):
 *   - immediate: sent the moment the mark is saved;
 *   - after_lesson: queued for 2 hours after the lesson ends, so a mistake
 *     corrected in class never reaches anyone. Needs a scheduler calling
 *     /api/cron/notifications (sendDueAbsenceNotices).
 */

const DELAY_AFTER_LESSON_MS = 2 * 60 * 60 * 1000;

/**
 * The latest end time of a class's lessons on a date (custom end times,
 * two-hour slots, extra sessions and cancellations all count). null when
 * the class has no lesson that day (e.g. an off-schedule mark).
 */
export async function lessonEndTime(
  supabase: SupabaseClient,
  classId: string,
  date: string,
): Promise<string | null> {
  const ends = (await classLessons(supabase, classId, date, date))
    .map((lesson) => lesson.end)
    .filter((end): end is string => Boolean(end))
    .sort();
  return ends.at(-1) ?? null;
}

export type AttendanceChange = {
  attendanceRecordId: string | null;
  classId: string;
  className: string;
  studentId: string;
  attendanceDate: string;
  status: string;
  triggeredBy: string;
};

/**
 * Called (after the response) whenever a mark is saved or cleared. Never
 * throws.
 */
export async function handleAttendanceChange(
  supabase: SupabaseClient,
  change: AttendanceChange,
  now: Date = new Date(),
): Promise<void> {
  try {
    // Anything but "absent" (or a cleared mark): withdraw a notice that's
    // still waiting. A cleared mark's row is gone already (FK cascade).
    if (change.status !== "absent") {
      if (change.attendanceRecordId) {
        await supabase
          .from("absence_notifications")
          .delete()
          .eq("attendance_record_id", change.attendanceRecordId)
          .is("sent_at", null);
      }
      return;
    }
    // Only on the lesson's own day.
    if (!change.attendanceRecordId || change.attendanceDate !== athensToday(now)) return;

    const settings = await loadNotificationSettings(supabase);
    if (!settings.absences) return;

    if (settings.absence_timing === "immediate") {
      // The row doubles as "already told": saving "absent" again, or
      // absent -> present -> absent, never notifies twice for one lesson.
      const { data: inserted } = await supabase
        .from("absence_notifications")
        .upsert(
          {
            attendance_record_id: change.attendanceRecordId,
            student_id: change.studentId,
            class_id: change.classId,
            attendance_date: change.attendanceDate,
            send_at: now.toISOString(),
            sent_at: now.toISOString(),
          },
          { onConflict: "attendance_record_id", ignoreDuplicates: true },
        )
        .select("id");
      if (!inserted || inserted.length === 0) return;
      await sendAbsenceNotice(supabase, change.studentId, change.classId, change.className, change.attendanceDate, change.triggeredBy);
      return;
    }

    const end = await lessonEndTime(supabase, change.classId, change.attendanceDate);
    const sendAt = end
      ? new Date(athensDateTimeToUtc(change.attendanceDate, end).getTime() + DELAY_AFTER_LESSON_MS)
      : new Date(now.getTime() + DELAY_AFTER_LESSON_MS);
    // Already past "2 hours after the lesson" (a late mark the same day):
    // send at the next scheduler run.
    const effective = sendAt < now ? now : sendAt;

    await supabase.from("absence_notifications").upsert(
      {
        attendance_record_id: change.attendanceRecordId,
        student_id: change.studentId,
        class_id: change.classId,
        attendance_date: change.attendanceDate,
        send_at: effective.toISOString(),
      },
      { onConflict: "attendance_record_id", ignoreDuplicates: true },
    );
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { feature: "push-notifications", job: "absence" } });
  }
}

async function sendAbsenceNotice(
  supabase: SupabaseClient,
  studentId: string,
  classId: string,
  className: string,
  date: string,
  triggeredBy: string | null,
) {
  const { data: student } = await supabase
    .from("students")
    .select("first_name")
    .eq("id", studentId)
    .maybeSingle();
  await notify({
    event: "absence_student",
    parentEvent: "absence_parent",
    to: { kind: "student_and_parents", studentId },
    classId,
    values: {
      class: className,
      date: formatShortDateEl(date),
      student: student?.first_name ?? "",
    },
    tag: `absence-${studentId}-${date}`,
    triggeredBy,
    supabase,
  });
}

/**
 * Sends the queued absence notices that are due. Re-checks each one: the
 * mark must still be "absent" and it must still be the lesson's day -
 * otherwise it's dropped. Each is claimed before sending, so two
 * overlapping runs can't send it twice. Never throws.
 */
export async function sendDueAbsenceNotices(
  supabase: SupabaseClient,
  now: Date = new Date(),
): Promise<number> {
  try {
    const { data: due } = await supabase
      .from("absence_notifications")
      .select("id, attendance_record_id, student_id, class_id, attendance_date")
      .is("sent_at", null)
      .lte("send_at", now.toISOString());

    let sent = 0;
    for (const row of due ?? []) {
      const { data: claimed } = await supabase
        .from("absence_notifications")
        .update({ sent_at: now.toISOString() })
        .eq("id", row.id)
        .is("sent_at", null)
        .select("id");
      if (!claimed || claimed.length === 0) continue;

      if (row.attendance_date !== athensToday(now)) continue;
      const { data: record } = await supabase
        .from("attendance_records")
        .select("status, class_name")
        .eq("id", row.attendance_record_id)
        .maybeSingle();
      if (!record || record.status !== "absent") continue;

      await sendAbsenceNotice(
        supabase,
        row.student_id,
        row.class_id,
        record.class_name ?? "",
        row.attendance_date,
        null,
      );
      sent++;
    }
    return sent;
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { feature: "push-notifications", job: "absence_queue" } });
    return 0;
  }
}
