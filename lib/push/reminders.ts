import "server-only";
import * as Sentry from "@sentry/nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/push/notify";
import { loadNotificationSettings } from "@/lib/push/settings";
import {
  addDaysToDate,
  athensDateAndTime,
  athensDateTimeToUtc,
  athensMinutesNow,
  athensToday,
  formatShortDateEl,
  timeToMinutes,
} from "@/lib/push/athens-time";
import { classLessons } from "@/lib/push/class-lessons";
import { assessmentWhen, shortNote } from "@/lib/push/values";

/**
 * The evening-before reminders: homework (due tomorrow, or set for the
 * class's next lesson which is tomorrow), quizzes due tomorrow (only to
 * students who haven't done them) and tests tomorrow. Each item is
 * reminded once (reminder_sent_at, claimed before sending, so overlapping
 * runs can't double up). Never throws.
 *
 * `force` (the daily Vercel cron) skips the time-of-day check; a frequent
 * scheduler calls without it and the reminders go out once the App tab's
 * time has passed.
 */
export type ReminderResult = { homework: number; quizzes: number; tests: number };

// How far back to look for homework still waiting for its next lesson.
const HOMEWORK_LOOKBACK_DAYS = 21;

async function claim(
  supabase: SupabaseClient,
  table: string,
  ids: string[],
  now: Date,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase
    .from(table)
    .update({ reminder_sent_at: now.toISOString() })
    .in("id", ids)
    .is("reminder_sent_at", null)
    .select("id");
  return (data ?? []).map((row) => row.id as string);
}

/**
 * The date a piece of homework is "for": its due date, or else the class's
 * first lesson after the day it was set.
 */
export async function homeworkTargetDate(
  supabase: SupabaseClient,
  homework: { class_id: string; due_date: string | null; created_at: string },
): Promise<string | null> {
  if (homework.due_date) return homework.due_date;
  const setOn = athensDateAndTime(homework.created_at).date;
  const from = addDaysToDate(setOn, 1);
  const lessons = await classLessons(supabase, homework.class_id, from, addDaysToDate(from, 21));
  return lessons[0]?.date ?? null;
}

async function homeworkReminders(
  supabase: SupabaseClient,
  now: Date,
  reminderTime: string,
): Promise<number> {
  const today = athensToday(now);
  const tomorrow = addDaysToDate(today, 1);
  const since = athensDateTimeToUtc(addDaysToDate(today, -HOMEWORK_LOOKBACK_DAYS), "00:00");
  const { data: homework } = await supabase
    .from("homework")
    .select("id, class_id, note, due_date, created_at, classes:class_id (name)")
    .is("reminder_sent_at", null)
    .gte("created_at", since.toISOString());

  let sent = 0;
  const expired: string[] = [];
  for (const item of (homework ?? []) as unknown as {
    id: string;
    class_id: string;
    note: string;
    due_date: string | null;
    created_at: string;
    classes: { name: string } | null;
  }[]) {
    const target = await homeworkTargetDate(supabase, item);
    if (!target) continue;
    if (target < tomorrow) {
      expired.push(item.id); // its lesson has come and gone
      continue;
    }
    if (target !== tomorrow) continue;

    // Set this evening after the reminder time: the "new homework" notice
    // just went out, a reminder on top of it would be noise.
    const setAt = athensDateAndTime(item.created_at);
    const setTonight =
      setAt.date === today && timeToMinutes(setAt.time) >= timeToMinutes(reminderTime);

    const [claimed] = await claim(supabase, "homework", [item.id], now);
    if (!claimed || setTonight) continue;
    await notify({
      event: "homework_reminder",
      to: { kind: "class_students", classId: item.class_id },
      classId: item.class_id,
      values: {
        class: item.classes?.name ?? "",
        note: shortNote(item.note),
        due_date: formatShortDateEl(target),
      },
      tag: `homework-${item.id}`,
      supabase,
    });
    sent++;
  }
  // Stop re-checking homework whose lesson has passed.
  await claim(supabase, "homework", expired, now);
  return sent;
}

async function quizReminders(supabase: SupabaseClient, now: Date): Promise<number> {
  const tomorrow = addDaysToDate(athensToday(now), 1);
  const { data: assignments } = await supabase
    .from("quiz_assignments")
    .select("id, quiz_id, class_id, quizzes(title, notifications_disabled), classes(name)")
    .eq("due_date", tomorrow)
    .is("reminder_sent_at", null);

  let sent = 0;
  for (const row of (assignments ?? []) as unknown as {
    id: string;
    quiz_id: string;
    class_id: string;
    quizzes: { title: string; notifications_disabled: boolean } | null;
    classes: { name: string } | null;
  }[]) {
    const [claimed] = await claim(supabase, "quiz_assignments", [row.id], now);
    if (!claimed || !row.quizzes || row.quizzes.notifications_disabled) continue;

    const [{ data: roster }, { data: attempts }] = await Promise.all([
      supabase.from("student_class_assignments").select("student_id").eq("class_id", row.class_id),
      supabase.from("quiz_attempts").select("student_id").eq("quiz_id", row.quiz_id),
    ]);
    const done = new Set((attempts ?? []).map((a) => a.student_id as string));
    const pending = (roster ?? [])
      .map((r) => r.student_id as string)
      .filter((id) => !done.has(id));
    if (pending.length === 0) continue;

    await notify({
      event: "quiz_reminder",
      to: { kind: "students", studentIds: pending },
      classId: row.class_id,
      values: {
        class: row.classes?.name ?? "",
        title: row.quizzes.title,
        due_date: formatShortDateEl(tomorrow),
      },
      tag: `quiz-${row.quiz_id}`,
      supabase,
    });
    sent++;
  }
  return sent;
}

type TestAssignment = {
  id: string;
  assessment_id: string;
  student_id: string;
  kind: string;
  effective_scheduled_date: string | null;
  effective_scheduled_time: string | null;
  effective_deadline_at: string | null;
  assessments: { title: string; notifications_disabled: boolean; class_id: string | null } | null;
};

async function testReminders(supabase: SupabaseClient, now: Date): Promise<number> {
  const tomorrow = addDaysToDate(athensToday(now), 1);
  const dayStart = athensDateTimeToUtc(tomorrow, "00:00").toISOString();
  const dayEnd = athensDateTimeToUtc(addDaysToDate(tomorrow, 1), "00:00").toISOString();
  const columns =
    "id, assessment_id, student_id, kind, effective_scheduled_date, effective_scheduled_time, effective_deadline_at, assessments:assessment_id (title, notifications_disabled, class_id)";

  // Mock exams dated tomorrow, and short tests whose deadline is tomorrow;
  // only ones the student hasn't sat yet.
  const [{ data: exams }, { data: deadlines }] = await Promise.all([
    supabase
      .from("assessment_assignments")
      .select(columns)
      .eq("effective_scheduled_date", tomorrow)
      .eq("status", "registered")
      .is("reminder_sent_at", null),
    supabase
      .from("assessment_assignments")
      .select(columns)
      .gte("effective_deadline_at", dayStart)
      .lt("effective_deadline_at", dayEnd)
      .eq("status", "registered")
      .is("reminder_sent_at", null),
  ]);

  const rows = [...(exams ?? []), ...(deadlines ?? [])] as unknown as TestAssignment[];
  const claimed = new Set(await claim(supabase, "assessment_assignments", rows.map((r) => r.id), now));

  // One notice per test and date/time, to all its students together.
  const groups = new Map<string, TestAssignment[]>();
  for (const row of rows) {
    if (!claimed.has(row.id) || !row.assessments || row.assessments.notifications_disabled) continue;
    const when = assessmentWhen({
      kind: row.kind,
      scheduledDate: row.effective_scheduled_date,
      scheduledTime: row.effective_scheduled_time,
      deadlineAt: row.effective_deadline_at,
    });
    const key = `${row.assessment_id}|${when.date}|${when.time}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  for (const group of groups.values()) {
    const first = group[0];
    const when = assessmentWhen({
      kind: first.kind,
      scheduledDate: first.effective_scheduled_date,
      scheduledTime: first.effective_scheduled_time,
      deadlineAt: first.effective_deadline_at,
    });
    await notify({
      event: "assessment_reminder",
      to: { kind: "students", studentIds: group.map((r) => r.student_id) },
      classId: first.assessments?.class_id ?? null,
      values: { title: first.assessments?.title ?? "", date: when.date, time: when.time },
      tag: `assessment-${first.assessment_id}`,
      supabase,
    });
  }
  return groups.size;
}

export async function sendEveningReminders(
  supabase: SupabaseClient,
  { now = new Date(), force = false }: { now?: Date; force?: boolean } = {},
): Promise<ReminderResult> {
  const result: ReminderResult = { homework: 0, quizzes: 0, tests: 0 };
  try {
    const settings = await loadNotificationSettings(supabase);
    if (!force && athensMinutesNow(now) < timeToMinutes(settings.homework_reminder_time)) {
      return result;
    }
    // A switched-off type is left unclaimed, so turning it back on before
    // the evening still sends tonight's reminders.
    if (settings.homework_reminders) {
      result.homework = await homeworkReminders(supabase, now, settings.homework_reminder_time);
    }
    if (settings.quiz_reminders) result.quizzes = await quizReminders(supabase, now);
    if (settings.test_reminders) result.tests = await testReminders(supabase, now);
  } catch (error: unknown) {
    Sentry.captureException(error, { tags: { feature: "push-notifications", job: "evening_reminders" } });
  }
  return result;
}
