import { describe, expect, it } from "vitest";
import { projectOccurrences } from "@/lib/calendar-projection";
import {
  groupDayTasks,
  lessonLabelFor,
  lessonRefFor,
  lessonRefKey,
  overdueTasks,
  taskProgress,
  type TeacherTask,
} from "@/lib/teacher-tasks";

// 2026-10-26 is a Monday.
const MONDAY = "2026-10-26";
const CLASS_A = { id: "class-a", name: "Β Λυκείου", archivedAt: null };

function task(overrides: Partial<TeacherTask>): TeacherTask {
  return {
    id: "t",
    kind: "personal",
    title: "Task",
    task_date: MONDAY,
    task_time: null,
    phase: null,
    class_id: null,
    slot_time: null,
    calendar_event_id: null,
    lesson_label: null,
    done_at: null,
    created_at: "2026-10-20T10:00:00Z",
    ...overrides,
  };
}

const occurrences = projectOccurrences({
  from: MONDAY,
  to: MONDAY,
  slots: [
    { classId: CLASS_A.id, day: "Mon", time: "16:00" },
    { classId: CLASS_A.id, day: "Mon", time: "18:00" },
  ],
  classes: [CLASS_A],
  events: [
    {
      id: "one-off",
      event_type: "ad_hoc_lesson",
      event_date: MONDAY,
      start_time: "20:00",
      end_time: null,
      class_id: null,
      class_name: null,
      student_id: "s1",
      student_name: "Ada Lovelace",
      contact_name: null,
      title: null,
      notes: null,
    },
  ],
});

describe("lessonRefFor", () => {
  it("files a template lesson by class and slot, an event lesson by event", () => {
    expect(occurrences.map((o) => lessonRefKey(lessonRefFor(o)!))).toEqual([
      "class:class-a|16:00",
      "class:class-a|18:00",
      "event:one-off",
    ]);
    expect(lessonLabelFor(occurrences[2])).toBe("Ada Lovelace 20:00");
  });
});

describe("groupDayTasks", () => {
  const tasks = [
    task({ id: "after", kind: "lesson", phase: "after", class_id: "class-a", slot_time: "16:00", lesson_label: "Β Λυκείου 16:00", created_at: "2026-10-20T09:00:00Z" }),
    task({ id: "before", kind: "lesson", phase: "before", class_id: "class-a", slot_time: "16:00", lesson_label: "Β Λυκείου 16:00", created_at: "2026-10-20T11:00:00Z" }),
    task({ id: "second-slot", kind: "lesson", phase: "before", class_id: "class-a", slot_time: "18:00", lesson_label: "Β Λυκείου 18:00" }),
    task({ id: "one-off", kind: "lesson", phase: "before", calendar_event_id: "one-off", lesson_label: "Ada Lovelace 20:00" }),
    task({ id: "moved", kind: "lesson", phase: "before", class_id: "class-a", slot_time: "19:00", lesson_label: "Β Λυκείου 19:00" }),
    task({ id: "timed", task_time: "12:00" }),
    task({ id: "untimed" }),
    task({ id: "other-day", task_date: "2026-10-27" }),
  ];
  const grouped = groupDayTasks(tasks, MONDAY, occurrences);

  it("puts each lesson's tasks under it, before first", () => {
    expect(grouped.byLesson.get("class:class-a|16:00")?.map((t) => t.id)).toEqual(["before", "after"]);
    expect(grouped.byLesson.get("class:class-a|18:00")?.map((t) => t.id)).toEqual(["second-slot"]);
    expect(grouped.byLesson.get("event:one-off")?.map((t) => t.id)).toEqual(["one-off"]);
  });

  it("lists personal tasks untimed first, and keeps a lesson task whose lesson is gone", () => {
    expect(grouped.personal.map((t) => t.id)).toEqual(["untimed", "timed"]);
    expect(grouped.unlinked.map((t) => t.id)).toEqual(["moved"]);
  });

  it("keeps a cancelled lesson's tasks under it", () => {
    const cancelled = projectOccurrences({
      from: MONDAY,
      to: MONDAY,
      slots: [{ classId: CLASS_A.id, day: "Mon", time: "16:00" }],
      classes: [CLASS_A],
      events: [
        {
          id: "c",
          event_type: "cancellation",
          event_date: MONDAY,
          start_time: "16:00",
          end_time: null,
          class_id: CLASS_A.id,
          class_name: CLASS_A.name,
          student_id: null,
          student_name: null,
          contact_name: null,
          title: null,
          notes: null,
        },
      ],
    });
    expect(groupDayTasks(tasks, MONDAY, cancelled).byLesson.get("class:class-a|16:00")).toHaveLength(2);
  });
});

describe("overdueTasks / taskProgress", () => {
  it("lists open tasks from earlier days, oldest first", () => {
    const tasks = [
      task({ id: "today", task_date: "2026-10-26" }),
      task({ id: "done", task_date: "2026-10-20", done_at: "2026-10-20T12:00:00Z" }),
      task({ id: "older", task_date: "2026-10-19" }),
      task({ id: "old", task_date: "2026-10-22" }),
    ];
    expect(overdueTasks(tasks, "2026-10-26").map((t) => t.id)).toEqual(["older", "old"]);
    expect(taskProgress(tasks)).toEqual({ done: 1, total: 4 });
  });
});
