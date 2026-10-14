"use client";

import { useState } from "react";
import Link from "next/link";
import { NotebookPen } from "lucide-react";

import { formatCompanionDate } from "@/components/teacher-app/format";
import type { CompanionHomework } from "@/lib/teacher-app/load";
import { cn } from "@/lib/utils";

function dueLabel(dueDate: string | null, today: string): string {
  if (!dueDate) return "no due date";
  if (dueDate === today) return "due today";
  return `due ${formatCompanionDate(dueDate)}`;
}

/**
 * The class's last homework above the roster, so it can be checked in class.
 * Two lines by default; tap to read the rest.
 */
export function LastHomework({
  homework,
  today,
  homeworkHref,
}: {
  homework: CompanionHomework | null;
  today: string;
  homeworkHref: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <NotebookPen className="size-3.5" aria-hidden="true" />
          {homework
            ? `Last homework · set ${formatCompanionDate(homework.created_at.slice(0, 10))} · ${dueLabel(homework.due_date, today)}`
            : "No homework set for this class yet"}
        </h2>
        <Link href={homeworkHref} className="shrink-0 text-xs font-medium text-brand">
          {homework ? "All" : "Set one"}
        </Link>
      </div>
      {homework && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className={cn(
            "mt-1.5 w-full whitespace-pre-wrap text-left text-sm",
            !expanded && "line-clamp-2",
          )}
        >
          {homework.note}
        </button>
      )}
    </section>
  );
}
