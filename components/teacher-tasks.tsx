"use client";

import * as React from "react";
import { format } from "date-fns";
import { ChevronDownIcon, InboxIcon, ListTodoIcon, PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
import { SetDateButton, TaskDateEditor, type TaskDateChange } from "@/components/task-dates-ui";
import { plainTitle } from "@/lib/task-tags";
import { fromIsoDate } from "@/lib/calendar-projection";
import { cn } from "@/lib/utils";
import {
  TASK_TITLE_MAX_LENGTH,
  taskDueDay,
  taskProgress,
  type TaskPhase,
  type TeacherTask,
} from "@/lib/teacher-tasks";

// The Calendar tab's task lists (see lib/teacher-tasks.ts). Pure UI: the
// caller owns the tasks state and the server calls.

export type TaskFlags = { isCall: boolean; isEmail: boolean };

export type TaskHandlers = {
  onToggle: (task: TeacherTask, done: boolean) => void;
  onDelete: (task: TeacherTask) => void;
  /** Personal tasks: another day, Anytime, or an anytime due date. */
  onSetDate?: (task: TeacherTask, change: TaskDateChange) => void;
};

const shortDate = (date: string) => format(fromIsoDate(date), "EEE d MMM");

function TaskRow({
  task,
  meta,
  metaTone,
  onToggle,
  onDelete,
  onSetDate,
}: { task: TeacherTask; meta?: string; metaTone?: "overdue" } & TaskHandlers) {
  const directory = useTaskDirectory();
  const [editingDate, setEditingDate] = React.useState(false);
  const done = task.done_at !== null;
  const id = `task-${task.id}`;
  return (
    <li className="group py-1">
      <div className="flex items-start gap-2">
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
          <TaskTitle title={task.title} directory={directory} />
          {meta ? (
            <span
              className={cn(
                "ml-1.5 text-xs no-underline",
                metaTone === "overdue" && !done
                  ? "font-medium text-amber-700 dark:text-amber-400"
                  : "text-muted-foreground",
              )}
            >
              {meta}
            </span>
          ) : null}
        </label>
        {task.is_call && <CallButton title={task.title} directory={directory} />}
        {task.is_email && <EmailButton title={task.title} directory={directory} className="h-6 w-7" />}
        {task.kind === "personal" && onSetDate ? (
          <SetDateButton
            task={task}
            open={editingDate}
            onOpenChange={setEditingDate}
            className="h-6 w-7 opacity-60 hover:opacity-100"
          />
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-muted-foreground opacity-60 hover:opacity-100"
          aria-label={`Delete task ${plainTitle(task.title)}`}
          onClick={() => onDelete(task)}
        >
          <Trash2Icon className="h-3.5 w-3.5" />
        </Button>
      </div>
      {editingDate && onSetDate ? (
        <TaskDateEditor
          task={task}
          onChange={(change) => {
            setEditingDate(false);
            onSetDate(task, change);
          }}
        />
      ) : null}
    </li>
  );
}

function AddTaskForm({
  label,
  placeholder = label,
  withTime = false,
  withDueDate = false,
  onAdd,
}: {
  label: string;
  /** Shorter visible hint, when the label names the lesson too. */
  placeholder?: string;
  withTime?: boolean;
  /** Anytime: an optional due date instead of a time. */
  withDueDate?: boolean;
  onAdd: (title: string, when: string | null, flags: TaskFlags) => Promise<boolean>;
}) {
  const directory = useTaskDirectory();
  const [draft, setDraft] = React.useState<TaggedDraft>(EMPTY_DRAFT);
  const [isCall, setIsCall] = React.useState(false);
  const [isEmail, setIsEmail] = React.useState(false);
  const [when, setWhen] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.text.trim()) return;
    setSaving(true);
    const ok = await onAdd(draftTitle(draft), (withTime || withDueDate) && when ? when : null, {
      isCall,
      isEmail,
    });
    setSaving(false);
    if (ok) {
      setDraft(EMPTY_DRAFT);
      setIsCall(false);
      setIsEmail(false);
      setWhen("");
    }
  };

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <CallToggle pressed={isCall} onPressedChange={setIsCall} className="h-8 w-8" />
      <EmailToggle pressed={isEmail} onPressedChange={setIsEmail} className="h-8 w-8" />
      <TaskTextInput
        draft={draft}
        onDraftChange={setDraft}
        directory={directory}
        aria-label={label}
        placeholder={withTime || withDueDate ? `${placeholder} · @ + # to tag` : placeholder}
        maxLength={TASK_TITLE_MAX_LENGTH}
        className="flex h-8 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
      />
      {withTime ? (
        <Input
          type="time"
          aria-label="Time (optional)"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="h-8 w-28 text-sm"
        />
      ) : null}
      {withDueDate ? (
        <Input
          type="date"
          aria-label="Due date (optional)"
          title="Due date (optional)"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
          className="h-8 w-36 text-sm"
        />
      ) : null}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="h-8"
        disabled={saving || !draft.text.trim()}
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
  onAdd: (phase: TaskPhase, title: string, flags: TaskFlags) => Promise<boolean>;
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
                  onAdd={(title, _when, flags) => onAdd(phase, title, flags)}
                />
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** "Due Mon 2 Nov" / "Overdue · was due Mon 2 Nov" for an anytime task. */
function dueMeta(task: TeacherTask, today: string): { meta?: string; tone?: "overdue" } {
  if (!task.due_date) return {};
  if (task.done_at === null && task.due_date < today) {
    return { meta: `was due ${shortDate(task.due_date)}`, tone: "overdue" };
  }
  return { meta: task.due_date === today ? "due today" : `due ${shortDate(task.due_date)}` };
}

/**
 * Tasks with no day, folded until tapped: "Anytime 3", amber when one is
 * past its due date. Its own add field takes an optional due date.
 */
export function AnytimeTasks({
  tasks,
  today,
  onAdd,
  ...handlers
}: {
  tasks: TeacherTask[];
  today: string;
  onAdd: (title: string, dueDate: string | null, flags: TaskFlags) => Promise<boolean>;
} & TaskHandlers) {
  const [open, setOpen] = React.useState(false);
  const openCount = tasks.filter((task) => task.done_at === null).length;
  const late = tasks.some((task) => {
    const due = taskDueDay(task);
    return task.done_at === null && due !== null && due < today;
  });
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex w-full items-center gap-1.5 text-xs font-medium uppercase tracking-wide",
          late ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
        )}
      >
        <InboxIcon className="h-3.5 w-3.5" />
        Anytime
        {openCount > 0 ? (
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold normal-case text-muted-foreground">
            {openCount}
          </span>
        ) : null}
        <ChevronDownIcon className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <>
          {tasks.length > 0 ? (
            <ul>
              {tasks.map((task) => {
                const { meta, tone } = dueMeta(task, today);
                return <TaskRow key={task.id} task={task} meta={meta} metaTone={tone} {...handlers} />;
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">
              Things to do some day - no date needed.
            </p>
          )}
          <AddTaskForm label="Add an anytime task" withDueDate onAdd={onAdd} />
        </>
      ) : null}
    </div>
  );
}

/**
 * The day's own to-dos (no lesson), plus lesson tasks whose lesson is no
 * longer that day, anytime tasks due that day, and - on today - everything
 * still open from earlier days. The Anytime list sits below.
 */
export function MyTasks({
  personal,
  unlinked,
  overdue,
  dueAnytime = [],
  anytime,
  today,
  onAdd,
  onAddAnytime,
  ...handlers
}: {
  personal: TeacherTask[];
  unlinked: TeacherTask[];
  overdue: TeacherTask[];
  /** Anytime tasks due on this day. */
  dueAnytime?: TeacherTask[];
  /** Shown when given (with onAddAnytime). */
  anytime?: TeacherTask[];
  today?: string;
  onAdd: (title: string, time: string | null, flags: TaskFlags) => Promise<boolean>;
  onAddAnytime?: (title: string, dueDate: string | null, flags: TaskFlags) => Promise<boolean>;
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
                meta={
                  task.task_date === null
                    ? `Anytime · was due ${shortDate(task.due_date!)}`
                    : `${shortDate(task.task_date)}${task.lesson_label ? ` · ${task.lesson_label}` : ""}`
                }
                {...handlers}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {personal.length > 0 || unlinked.length > 0 || dueAnytime.length > 0 ? (
        <ul>
          {personal.map((task) => (
            <TaskRow key={task.id} task={task} meta={task.task_time ?? undefined} {...handlers} />
          ))}
          {dueAnytime.map((task) => (
            <TaskRow key={task.id} task={task} meta="Anytime · due this day" {...handlers} />
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

      {anytime && onAddAnytime && today ? (
        <AnytimeTasks tasks={anytime} today={today} onAdd={onAddAnytime} {...handlers} />
      ) : null}
    </div>
  );
}
