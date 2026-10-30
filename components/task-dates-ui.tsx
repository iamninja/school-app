"use client";

import * as React from "react";
import { CalendarClock } from "lucide-react";

import { cn } from "@/lib/utils";
import type { TeacherTask } from "@/lib/teacher-tasks";

// "Set date" on a personal task, shared by the console and the phone: put
// it on a day, move it to Anytime, or give an anytime task a due date.

export type TaskDateChange = { date: string | null; dueDate?: string | null };

/** The calendar-clock button that opens the editor below a task. */
export function SetDateButton({
  task,
  open,
  onOpenChange,
  className,
}: {
  task: TeacherTask;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={task.task_date === null ? "Set a day or due date" : "Move to another day or Anytime"}
      title="Set date"
      onClick={() => onOpenChange(!open)}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:bg-muted",
        open && "bg-muted text-foreground",
        className,
      )}
    >
      <CalendarClock className="size-4" aria-hidden="true" />
    </button>
  );
}

export function TaskDateEditor({
  task,
  onChange,
  inputClassName,
}: {
  task: TeacherTask;
  onChange: (change: TaskDateChange) => void;
  inputClassName?: string;
}) {
  const field = cn(
    "h-9 rounded-md border border-input bg-background px-2 text-sm",
    inputClassName,
  );
  const anytime = task.task_date === null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-muted/50 px-2 py-2 text-xs">
      <label className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Day</span>
        <input
          type="date"
          aria-label="Day"
          value={task.task_date ?? ""}
          onChange={(event) => event.target.value && onChange({ date: event.target.value })}
          className={field}
        />
      </label>
      {anytime ? (
        <label className="flex items-center gap-1.5">
          <span className="text-muted-foreground">or due by</span>
          <input
            type="date"
            aria-label="Due date"
            value={task.due_date ?? ""}
            onChange={(event) => onChange({ date: null, dueDate: event.target.value || null })}
            className={field}
          />
        </label>
      ) : (
        <button
          type="button"
          onClick={() => onChange({ date: null })}
          className="h-9 rounded-md border border-border bg-background px-3 font-medium hover:bg-muted"
        >
          Move to Anytime
        </button>
      )}
    </div>
  );
}
