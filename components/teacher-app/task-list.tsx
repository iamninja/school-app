"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Inbox, ListTodo, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  createTaskAction,
  deleteTaskAction,
  setTaskDoneAction,
  updateTaskAction,
  type CreateTaskInput,
} from "@/app/protected/teacher/task-actions";
import { TOAST_TOP, formatCompanionDate } from "@/components/teacher-app/format";
import { SetDateButton, TaskDateEditor, type TaskDateChange } from "@/components/task-dates-ui";
import { getErrorMessage } from "@/lib/expected-error";
import {
  TASK_TITLE_MAX_LENGTH,
  anytimeTasks as sortAnytime,
  taskDueDay,
  type LessonRef,
  type TaskPhase,
  type TeacherTask,
} from "@/lib/teacher-tasks";
import { cn } from "@/lib/utils";
import {
  CallButton,
  CallToggle,
  EMPTY_DRAFT,
  EmailButton,
  EmailToggle,
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
type Flags = { isCall: boolean; isEmail: boolean };

/**
 * The companion's task lists - big tick targets, a quick "add" field per
 * list. Same actions as the console's Calendar tab. Each change re-reads
 * the screen so counts elsewhere (the Today rows) follow. On Today the
 * Anytime list (tasks with no day) sits below, folded until tapped.
 */
export function CompanionTasks({
  title,
  target,
  tasks: initialTasks,
  overdue = [],
  dueAnytime = [],
  anytime,
  today,
}: {
  title: string;
  target: TaskTarget;
  tasks: TeacherTask[];
  /** Open tasks from earlier days, and anytime ones past due (Today screen only). */
  overdue?: TeacherTask[];
  /** Anytime tasks due on this day. */
  dueAnytime?: TeacherTask[];
  /** The Anytime list (Today screen only). */
  anytime?: TeacherTask[];
  today?: string;
}) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initialTasks);
  const [overdueTasks, setOverdue] = useState(overdue);
  const [dueTasks, setDue] = useState(dueAnytime);
  const [anytimeTasks, setAnytime] = useState(anytime ?? []);
  const lists = [setTasks, setOverdue, setDue, setAnytime];

  const replace = (next: TeacherTask) => {
    for (const set of lists) set((prev) => prev.map((task) => (task.id === next.id ? next : task)));
  };
  const drop = (id: string) => {
    for (const set of lists) set((prev) => prev.filter((task) => task.id !== id));
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
    drop(task.id);
    try {
      await deleteTaskAction(task.id);
      router.refresh();
    } catch {
      toast.error("Couldn't delete the task", TOAST_TOP);
      router.refresh();
    }
  };

  // Moving a task changes which lists it belongs in - the screen re-reads.
  const setDate = async (task: TeacherTask, change: TaskDateChange) => {
    try {
      const moved = await updateTaskAction(task.id, change);
      drop(task.id);
      if (moved.task_date === null) setAnytime((prev) => [...prev, moved]);
      else if (moved.task_date === target.date) setTasks((prev) => [...prev, moved]);
      toast.success(
        moved.task_date === null
          ? moved.due_date
            ? `Anytime · due ${formatCompanionDate(moved.due_date)}`
            : "Moved to Anytime"
          : `Moved to ${formatCompanionDate(moved.task_date)}`,
        TOAST_TOP,
      );
      router.refresh();
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't move the task"), TOAST_TOP);
    }
  };

  const add = async (text: string, phase: TaskPhase | undefined, flags: Flags): Promise<boolean> => {
    const input: CreateTaskInput =
      target.kind === "personal"
        ? { kind: "personal", title: text, date: target.date, ...flags }
        : { kind: "lesson", title: text, date: target.date, phase: phase!, lesson: target.lesson, ...flags };
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

  const addAnytime = async (text: string, dueDate: string | null, flags: Flags): Promise<boolean> => {
    try {
      const created = await createTaskAction({ kind: "personal", title: text, date: null, dueDate, ...flags });
      setAnytime((prev) => [...prev, created]);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(getErrorMessage(error, "Couldn't add the task"), TOAST_TOP);
      return false;
    }
  };

  const handlers = { onToggle: toggle, onDelete: remove, onSetDate: setDate };

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
                meta={
                  task.task_date === null
                    ? `Anytime · was due ${formatCompanionDate(task.due_date!)}`
                    : `${formatCompanionDate(task.task_date)}${task.lesson_label ? ` · ${task.lesson_label}` : ""}`
                }
                {...handlers}
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
          {(section.tasks.length > 0 || (section.key === "day" && dueTasks.length > 0)) && (
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
                  {...handlers}
                />
              ))}
              {section.key === "day" &&
                dueTasks.map((task) => (
                  <TaskItem key={task.id} task={task} meta="Anytime · due this day" {...handlers} />
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
            onAdd={(text, _due, flags) => add(text, section.phase, flags)}
          />
        </div>
      ))}

      {anytime && today && (
        <AnytimeList tasks={anytimeTasks} today={today} onAdd={addAnytime} {...handlers} />
      )}
    </section>
  );
}

type ItemHandlers = {
  onToggle: (task: TeacherTask) => void;
  onDelete: (task: TeacherTask) => void;
  onSetDate: (task: TeacherTask, change: TaskDateChange) => void;
};

function AnytimeList({
  tasks,
  today,
  onAdd,
  ...handlers
}: {
  tasks: TeacherTask[];
  today: string;
  onAdd: (text: string, dueDate: string | null, flags: Flags) => Promise<boolean>;
} & ItemHandlers) {
  const [open, setOpen] = useState(false);
  const openCount = tasks.filter((task) => task.done_at === null).length;
  const late = tasks.some((task) => {
    const due = taskDueDay(task);
    return task.done_at === null && due !== null && due < today;
  });
  const sorted = sortAnytime(tasks);
  return (
    <div className="border-t border-border pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 text-sm font-semibold",
          late ? "text-amber-800 dark:text-amber-300" : "text-foreground",
        )}
      >
        <Inbox className="size-4 text-muted-foreground" aria-hidden="true" />
        Anytime
        {openCount > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {openCount}
          </span>
        )}
        <ChevronDown
          className={cn("ml-auto size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="space-y-1">
          {sorted.length > 0 ? (
            <ul>
              {sorted.map((task) => {
                const overdue = task.done_at === null && task.due_date !== null && task.due_date < today;
                return (
                  <TaskItem
                    key={task.id}
                    task={task}
                    meta={
                      task.due_date
                        ? overdue
                          ? `was due ${formatCompanionDate(task.due_date)}`
                          : task.due_date === today
                            ? "due today"
                            : `due ${formatCompanionDate(task.due_date)}`
                        : undefined
                    }
                    metaTone={overdue ? "overdue" : undefined}
                    {...handlers}
                  />
                );
              })}
            </ul>
          ) : (
            <p className="py-1 text-xs text-muted-foreground">Things to do some day - no date needed.</p>
          )}
          <AddTask label="Add an anytime task" withDueDate onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}

function TaskItem({
  task,
  meta,
  metaTone,
  onToggle,
  onDelete,
  onSetDate,
}: {
  task: TeacherTask;
  meta?: string;
  metaTone?: "overdue";
} & ItemHandlers) {
  const directory = useTaskDirectory();
  const [editingDate, setEditingDate] = useState(false);
  const done = task.done_at !== null;
  return (
    <li>
      <div className="flex min-h-11 items-center gap-2">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={plainTitle(task.title)}
          onClick={() => void onToggle(task)}
          className={cn(
            "mr-1 flex size-7 shrink-0 items-center justify-center rounded-md border-2",
            done ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-background",
          )}
        >
          {done && <Check className="size-4" aria-hidden="true" />}
        </button>
        <span className={cn("min-w-0 flex-1 text-sm", done && "text-muted-foreground line-through")}>
          <TaskTitle title={task.title} directory={directory} />
          {meta && (
            <span
              className={cn(
                "block text-xs no-underline",
                metaTone === "overdue" && !done
                  ? "font-medium text-amber-800 dark:text-amber-300"
                  : "text-muted-foreground",
              )}
            >
              {meta}
            </span>
          )}
        </span>
        {task.is_call && <CallButton title={task.title} directory={directory} direct />}
        {task.is_email && <EmailButton title={task.title} directory={directory} />}
        {task.kind === "personal" && (
          <SetDateButton task={task} open={editingDate} onOpenChange={setEditingDate} className="size-9" />
        )}
        <button
          type="button"
          aria-label={`Delete task ${plainTitle(task.title)}`}
          onClick={() => void onDelete(task)}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground active:bg-muted"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {editingDate && (
        <TaskDateEditor
          task={task}
          inputClassName="h-10 text-base"
          onChange={(change) => {
            setEditingDate(false);
            void onSetDate(task, change);
          }}
        />
      )}
    </li>
  );
}

function AddTask({
  label,
  withDueDate = false,
  onAdd,
}: {
  label: string;
  /** Anytime: an optional due date under the field. */
  withDueDate?: boolean;
  onAdd: (text: string, dueDate: string | null, flags: Flags) => Promise<boolean>;
}) {
  const directory = useTaskDirectory();
  const [draft, setDraft] = useState<TaggedDraft>(EMPTY_DRAFT);
  const [isCall, setIsCall] = useState(false);
  const [isEmail, setIsEmail] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      className="space-y-1.5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (!draft.text.trim()) return;
        setSaving(true);
        const ok = await onAdd(draftTitle(draft), withDueDate && dueDate ? dueDate : null, { isCall, isEmail });
        setSaving(false);
        if (ok) {
          setDraft(EMPTY_DRAFT);
          setIsCall(false);
          setIsEmail(false);
          setDueDate("");
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <CallToggle pressed={isCall} onPressedChange={setIsCall} className="size-10" />
        <EmailToggle pressed={isEmail} onPressedChange={setIsEmail} className="size-10" />
        <TaskTextInput
          draft={draft}
          onDraftChange={setDraft}
          directory={directory}
          aria-label={label}
          placeholder={
            label === "Add a task for this day" || withDueDate ? `${withDueDate ? "Anytime task" : "Add a task"} · @ + #` : label
          }
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
      </div>
      {withDueDate && (
        <label className="flex items-center gap-2 pl-1 text-xs text-muted-foreground">
          Due by (optional)
          <input
            type="date"
            aria-label="Due date (optional)"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          />
        </label>
      )}
    </form>
  );
}
