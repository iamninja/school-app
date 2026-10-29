"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ListTodo, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  createTaskAction,
  deleteTaskAction,
  setTaskDoneAction,
  type CreateTaskInput,
} from "@/app/protected/teacher/task-actions";
import { TOAST_TOP, formatCompanionDate } from "@/components/teacher-app/format";
import { getErrorMessage } from "@/lib/expected-error";
import {
  TASK_TITLE_MAX_LENGTH,
  type LessonRef,
  type TaskPhase,
  type TeacherTask,
} from "@/lib/teacher-tasks";
import { cn } from "@/lib/utils";
import {
  CallButton,
  CallToggle,
  EMPTY_DRAFT,
  TaskTextInput,
  TaskTitle,
  draftTitle,
  useTaskDirectory,
  type TaggedDraft,
} from "@/components/task-tags-ui";
import { plainTitle } from "@/lib/task-tags";

/** Where a new task goes: the day itself, or one lesson's before/after list. */
export type TaskTarget =
  | { kind: "personal"; date: string }
  | { kind: "lesson"; date: string; lesson: LessonRef };

type Section = { key: string; label: string | null; tasks: TeacherTask[]; phase?: TaskPhase };

/**
 * The companion's task lists - big tick targets, a quick "add" field per
 * list. Same actions as the console's Calendar tab. Each change re-reads
 * the screen so counts elsewhere (the Today rows) follow.
 */
export function CompanionTasks({
  title,
  target,
  tasks: initialTasks,
  overdue = [],
}: {
  title: string;
  target: TaskTarget;
  tasks: TeacherTask[];
  /** Open tasks from earlier days (Today screen only). */
  overdue?: TeacherTask[];
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [overdueTasks, setOverdue] = useState(overdue);

  const replace = (next: TeacherTask) => {
    setTasks((prev) => prev.map((task) => (task.id === next.id ? next : task)));
    setOverdue((prev) => prev.map((task) => (task.id === next.id ? next : task)));
  };

  const toggle = async (task: TeacherTask) => {
    const done = task.done_at === null;
    replace({ ...task, done_at: done ? new Date().toISOString() : null });
    try {
      replace(await setTaskDoneAction(task.id, done));
      router.refresh();
    } catch (error) {
      replace(task);
      toast.error(getErrorMessage(error, "Couldn't save the task"), TOAST_TOP);
    }
  };

  const remove = async (task: TeacherTask) => {
    setTasks((prev) => prev.filter((item) => item.id !== task.id));
    setOverdue((prev) => prev.filter((item) => item.id !== task.id));
    try {
      await deleteTaskAction(task.id);
      router.refresh();
    } catch (error) {
      setTasks((prev) => [...prev, task]);
      toast.error(getErrorMessage(error, "Couldn't delete the task"), TOAST_TOP);
    }
  };

  const add = async (text: string, phase: TaskPhase | undefined, isCall: boolean): Promise<boolean> => {
    const input: CreateTaskInput =
      target.kind === "personal"
        ? { kind: "personal", title: text, date: target.date, isCall }
        : { kind: "lesson", title: text, date: target.date, phase: phase!, lesson: target.lesson, isCall };
    try {
      const created = await createTaskAction(input);
      setTasks((prev) => [...prev, created]);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't add the task"), TOAST_TOP);
      return false;
    }
  };

  const sections: Section[] =
    target.kind === "lesson"
      ? (["before", "after"] as const).map((phase) => ({
          key: phase,
          label: phase === "before" ? "Before" : "After",
          phase,
          tasks: tasks.filter((task) => task.phase === phase),
        }))
      : [{ key: "day", label: null, tasks }];

  return (
    <section aria-label={title} className="space-y-2 rounded-lg border border-border bg-card p-3">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <ListTodo className="size-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h2>

      {overdueTasks.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Overdue</p>
          <ul>
            {overdueTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                meta={`${formatCompanionDate(task.task_date)}${task.lesson_label ? ` · ${task.lesson_label}` : ""}`}
                onToggle={toggle}
                onDelete={remove}
              />
            ))}
          </ul>
        </div>
      )}

      {sections.map((section) => (
        <div key={section.key} className="space-y-1">
          {section.label && (
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {section.label}
            </p>
          )}
          {section.tasks.length > 0 && (
            <ul>
              {section.tasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  meta={
                    task.kind === "lesson" && target.kind === "personal"
                      ? `${task.lesson_label} · no longer scheduled`
                      : (task.task_time ?? undefined)
                  }
                  onToggle={toggle}
                  onDelete={remove}
                />
              ))}
            </ul>
          )}
          <AddTask
            label={
              section.phase === "before"
                ? "Add a task before the lesson"
                : section.phase === "after"
                  ? "Add a task after the lesson"
                  : "Add a task for this day"
            }
            onAdd={(text, isCall) => add(text, section.phase, isCall)}
          />
        </div>
      ))}
    </section>
  );
}

function TaskItem({
  task,
  meta,
  onToggle,
  onDelete,
}: {
  task: TeacherTask;
  meta?: string;
  onToggle: (task: TeacherTask) => void;
  onDelete: (task: TeacherTask) => void;
}) {
  const directory = useTaskDirectory();
  const done = task.done_at !== null;
  return (
    <li className="flex min-h-11 items-center gap-3">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={plainTitle(task.title)}
        onClick={() => void onToggle(task)}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md border-2",
          done ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background",
        )}
      >
        {done && <Check className="size-4" aria-hidden="true" />}
      </button>
      <span className={cn("min-w-0 flex-1 text-sm", done && "text-muted-foreground line-through")}>
        <TaskTitle title={task.title} directory={directory} />
        {meta && <span className="block text-xs text-muted-foreground no-underline">{meta}</span>}
      </span>
      {task.is_call && <CallButton title={task.title} directory={directory} direct />}
      <button
        type="button"
        aria-label={`Delete task ${plainTitle(task.title)}`}
        onClick={() => void onDelete(task)}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-muted"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

function AddTask({
  label,
  onAdd,
}: {
  label: string;
  onAdd: (text: string, isCall: boolean) => Promise<boolean>;
}) {
  const directory = useTaskDirectory();
  const [draft, setDraft] = useState<TaggedDraft>(EMPTY_DRAFT);
  const [isCall, setIsCall] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!draft.text.trim()) return;
        setSaving(true);
        const ok = await onAdd(draftTitle(draft), isCall);
        setSaving(false);
        if (ok) {
          setDraft(EMPTY_DRAFT);
          setIsCall(false);
        }
      }}
    >
      <CallToggle pressed={isCall} onPressedChange={setIsCall} className="size-10" />
      <TaskTextInput
        draft={draft}
        onDraftChange={setDraft}
        directory={directory}
        aria-label={label}
        placeholder={label === "Add a task for this day" ? "Add a task · @ to tag" : label}
        maxLength={TASK_TITLE_MAX_LENGTH}
        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
      />
      <button
        type="submit"
        disabled={saving || !draft.text.trim()}
        aria-label={`Add: ${label}`}
        className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-background disabled:opacity-50"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </form>
  );
}
