"use client";

import * as React from "react";
import { format } from "date-fns";
import { ListTodoIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { fromIsoDate } from "@/lib/calendar-projection";
import { cn } from "@/lib/utils";
import {
  TASK_TITLE_MAX_LENGTH,
  taskProgress,
  type TaskPhase,
  type TeacherTask,
} from "@/lib/teacher-tasks";

// The Calendar tab's task lists (see lib/teacher-tasks.ts). Pure UI: the
// caller owns the tasks state and the server calls.

export type TaskHandlers = {
  onToggle: (task: TeacherTask, done: boolean) => void;
  onDelete: (task: TeacherTask) => void;
};

function TaskRow({
  task,
  meta,
  onToggle,
  onDelete,
}: { task: TeacherTask; meta?: string } & TaskHandlers) {
  const done = task.done_at !== null;
  const id = `task-${task.id}`;
  return (
    <li className="group flex items-start gap-2 py-1">
      <Checkbox
        id={id}
        checked={done}
        onCheckedChange={(checked) => onToggle(task, checked === true)}
        className="mt-0.5"
      />
      <label
        htmlFor={id}
        className={cn(
          "min-w-0 flex-1 text-sm",
          done && "text-muted-foreground line-through",
        )}
      >
        {task.title}
        {meta ? (
          <span className="ml-1.5 text-xs text-muted-foreground no-underline">{meta}</span>
        ) : null}
      </label>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-1.5 text-muted-foreground opacity-60 hover:opacity-100"
        aria-label={`Delete task ${task.title}`}
        onClick={() => onDelete(task)}
      >
        <Trash2Icon className="h-3.5 w-3.5" />
      </Button>
    </li>
  );
}

function AddTaskForm({
  label,
  placeholder = label,
  withTime = false,
  onAdd,
}: {
  label: string;
  /** Shorter visible hint, when the label names the lesson too. */
  placeholder?: string;
  withTime?: boolean;
  onAdd: (title: string, time: string | null) => Promise<boolean>;
}) {
  const [title, setTitle] = React.useState("");
  const [time, setTime] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    const ok = await onAdd(title, withTime && time ? time : null);
    setSaving(false);
    if (ok) {
      setTitle("");
      setTime("");
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <Input
        aria-label={label}
        placeholder={placeholder}
        value={title}
        maxLength={TASK_TITLE_MAX_LENGTH}
        onChange={(e) => setTitle(e.target.value)}
        className="h-8 text-sm"
      />
      {withTime ? (
        <Input
          type="time"
          aria-label="Time (optional)"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-8 w-28 text-sm"
        />
      ) : null}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="h-8"
        disabled={saving || !title.trim()}
        aria-label={`Add: ${label}`}
      >
        <PlusIcon className="h-3.5 w-3.5" />
      </Button>
    </form>
  );
}

const PHASES: { phase: TaskPhase; label: string; placeholder: string }[] = [
  { phase: "before", label: "Before", placeholder: "Add a task before the lesson" },
  { phase: "after", label: "After", placeholder: "Add a task after the lesson" },
];

/**
 * A lesson's Before / After checklists, folded into a "Tasks 1/3" toggle
 * under the lesson row - amber while any task is still open.
 */
export function LessonTasks({
  tasks,
  lessonName,
  onAdd,
  ...handlers
}: {
  tasks: TeacherTask[];
  lessonName: string;
  onAdd: (phase: TaskPhase, title: string) => Promise<boolean>;
} & TaskHandlers) {
  const { done, total } = taskProgress(tasks);
  const [open, setOpen] = React.useState(false);

  return (
    <div className="basis-full border-t pt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex items-center gap-1.5 text-xs font-medium",
          total > done ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        <ListTodoIcon className="h-3.5 w-3.5" />
        {total === 0 ? "Add tasks" : `Tasks ${done}/${total}`}
      </button>
      {open ? (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {PHASES.map(({ phase, label, placeholder }) => {
            const list = tasks.filter((task) => task.phase === phase);
            return (
              <div key={phase} className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {label}
                </p>
                {list.length > 0 ? (
                  <ul>
                    {list.map((task) => (
                      <TaskRow key={task.id} task={task} {...handlers} />
                    ))}
                  </ul>
                ) : null}
                <AddTaskForm
                  label={`${placeholder} (${lessonName})`}
                  placeholder={placeholder}
                  onAdd={(title) => onAdd(phase, title)}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The day's own to-dos (no lesson), plus lesson tasks whose lesson is no
 * longer that day and - on today - everything still open from earlier days.
 */
export function MyTasks({
  personal,
  unlinked,
  overdue,
  onAdd,
  ...handlers
}: {
  personal: TeacherTask[];
  unlinked: TeacherTask[];
  overdue: TeacherTask[];
  onAdd: (title: string, time: string | null) => Promise<boolean>;
} & TaskHandlers) {
  return (
    <div className="mt-3 space-y-3 border-t pt-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <ListTodoIcon className="h-3.5 w-3.5" /> My tasks
      </p>

      {overdue.length > 0 ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Overdue
          </p>
          <ul>
            {overdue.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                meta={`${format(fromIsoDate(task.task_date), "EEE d MMM")}${task.lesson_label ? ` · ${task.lesson_label}` : ""}`}
                {...handlers}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {personal.length > 0 || unlinked.length > 0 ? (
        <ul>
          {personal.map((task) => (
            <TaskRow key={task.id} task={task} meta={task.task_time ?? undefined} {...handlers} />
          ))}
          {unlinked.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              meta={`${task.lesson_label} · no longer scheduled`}
              {...handlers}
            />
          ))}
        </ul>
      ) : null}

      <AddTaskForm label="Add a task for this day" withTime onAdd={onAdd} />
    </div>
  );
}
