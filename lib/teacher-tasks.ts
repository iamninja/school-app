import type { Occurrence } from "@/lib/calendar-projection";

// The teacher's own to-do list (supabase/migrations/*_teacher-tasks.sql):
// tasks before/after a lesson, and personal tasks with no lesson. Pure -
// shared by the Calendar tab and the phone companion, so both file a task
// under the same lesson.

export type TaskPhase = "before" | "after";

export interface TeacherTask {
  id: string;
  kind: "lesson" | "personal";
  title: string;
  task_date: string;
  task_time: string | null;
  phase: TaskPhase | null;
  class_id: string | null;
  slot_time: string | null;
  calendar_event_id: string | null;
  lesson_label: string | null;
  done_at: string | null;
  created_at: string;
}

export const TEACHER_TASK_COLUMNS =
  "id, kind, title, task_date, task_time, phase, class_id, slot_time, " +
  "calendar_event_id, lesson_label, done_at, created_at";

export const TASK_TITLE_MAX_LENGTH = 200;

/** Which lesson a task belongs to - see the migration for why two shapes. */
export type LessonRef =
  | { classId: string; slotTime: string }
  | { eventId: string };

/**
 * The lesson an occurrence is, for filing tasks under it. A template lesson
 * (recurring, or cancelled - a cancelled lesson keeps its tasks) is its
 * class + slot time; anything stored as its own event (extra session,
 * one-off, trial) is that event. Blocks take no lesson tasks.
 */
export function lessonRefFor(occurrence: Occurrence): LessonRef | null {
  if (occurrence.classId && occurrence.slotTime) {
    return { classId: occurrence.classId, slotTime: occurrence.slotTime };
  }
  if (
    occurrence.eventId &&
    (occurrence.kind === "extra_session" ||
      occurrence.kind === "ad_hoc_lesson" ||
      occurrence.kind === "trial_lesson")
  ) {
    return { eventId: occurrence.eventId };
  }
  return null;
}

export function lessonRefKey(ref: LessonRef): string {
  return "eventId" in ref ? `event:${ref.eventId}` : `class:${ref.classId}|${ref.slotTime}`;
}

function taskRefKey(task: TeacherTask): string | null {
  if (task.kind !== "lesson") return null;
  if (task.calendar_event_id) return `event:${task.calendar_event_id}`;
  if (task.class_id && task.slot_time) return `class:${task.class_id}|${task.slot_time}`;
  return null;
}

/** "Β Λυκείου 17:00" - what a lesson task says it's for once its lesson is gone. */
export function lessonLabelFor(occurrence: Occurrence): string {
  const name =
    occurrence.className ?? occurrence.studentName ?? occurrence.contactName ?? "Lesson";
  return occurrence.startTime ? `${name} ${occurrence.startTime}` : name;
}

export interface DayTasks {
  /** lessonRefKey -> that lesson's tasks, before then after, oldest first. */
  byLesson: Map<string, TeacherTask[]>;
  /** Personal tasks for the day, by time (untimed first), then created. */
  personal: TeacherTask[];
  /**
   * Lesson tasks whose lesson isn't on the day any more (the class was
   * deleted, the slot moved) - shown with the personal ones, by their
   * snapshot label, so nothing silently disappears.
   */
  unlinked: TeacherTask[];
}

function byCreated(a: TeacherTask, b: TeacherTask): number {
  return a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0;
}

/** Sorts one day's tasks into its lessons, personal tasks, and leftovers. */
export function groupDayTasks(
  tasks: TeacherTask[],
  date: string,
  occurrences: Occurrence[],
): DayTasks {
  const lessonKeys = new Set(
    occurrences
      .filter((occurrence) => occurrence.date === date)
      .map(lessonRefFor)
      .filter((ref): ref is LessonRef => ref !== null)
      .map(lessonRefKey),
  );

  const byLesson = new Map<string, TeacherTask[]>();
  const personal: TeacherTask[] = [];
  const unlinked: TeacherTask[] = [];
  for (const task of [...tasks].sort(byCreated)) {
    if (task.task_date !== date) continue;
    if (task.kind === "personal") {
      personal.push(task);
      continue;
    }
    const key = taskRefKey(task);
    if (key && lessonKeys.has(key)) {
      const list = byLesson.get(key) ?? [];
      list.push(task);
      byLesson.set(key, list);
    } else {
      unlinked.push(task);
    }
  }
  for (const list of byLesson.values()) {
    list.sort((a, b) => (a.phase === b.phase ? 0 : a.phase === "before" ? -1 : 1));
  }
  personal.sort((a, b) => {
    if (a.task_time === b.task_time) return 0;
    if (a.task_time === null) return -1;
    if (b.task_time === null) return 1;
    return a.task_time < b.task_time ? -1 : 1;
  });
  return { byLesson, personal, unlinked };
}

/** Open tasks from days before `today`, oldest first. */
export function overdueTasks(tasks: TeacherTask[], today: string): TeacherTask[] {
  return tasks
    .filter((task) => task.done_at === null && task.task_date < today)
    .sort((a, b) =>
      a.task_date === b.task_date ? byCreated(a, b) : a.task_date < b.task_date ? -1 : 1,
    );
}

/** "2/3" style counts for a lesson's tasks. */
export function taskProgress(tasks: TeacherTask[]): { done: number; total: number } {
  return { done: tasks.filter((task) => task.done_at !== null).length, total: tasks.length };
}
