import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";

import { formatCompanionDate } from "@/components/teacher-app/format";
import { TestKindChip } from "@/components/teacher-app/tests-kind";
import { requireCompanionTeacher } from "@/app/teacher-app/session";
import { loadTestsView } from "@/lib/teacher-app/load";
import { UPCOMING_DAYS, type TestsItem } from "@/lib/teacher-app/assessments";
import { athensToday } from "@/lib/push/athens-time";
import { cn } from "@/lib/utils";

type Tone = "overdue" | "today" | "upcoming" | "marks";

function whenLabel(item: TestsItem, today: string): string {
  const { date, time } = item.when;
  if (!date) return "Open";
  const day = date === today ? "Today" : formatCompanionDate(date);
  return time ? `${day} · ${time}` : day;
}

function detailLabel(item: TestsItem, tone: Tone): string {
  if (tone === "overdue") return `${item.count} not taken`;
  if (tone === "marks") return `${item.count} to mark · ${item.marked}/${item.total} marked`;
  // Some students moved to another date: say how many sit on this one.
  const split = item.count < item.total - item.taken ? ` · ${item.count} on this date` : "";
  return `Taken ${item.taken}/${item.total}${split}`;
}

function TestRow({ item, tone, today }: { item: TestsItem; tone: Tone; today: string }) {
  const { assessment } = item;
  return (
    <li>
      <Link
        href={`/teacher-app/assessments/${assessment.id}`}
        className={cn(
          "flex min-h-16 items-center gap-3 rounded-lg border px-4 py-2 active:bg-muted",
          tone === "overdue" ? "border-amber-500/40 bg-amber-500/10" : "border-border bg-card",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{assessment.title}</span>
            <TestKindChip kind={assessment.kind} />
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {[assessment.class_name, whenLabel(item, today)].filter(Boolean).join(" · ")}
          </div>
          <div
            className={cn(
              "text-xs font-medium",
              tone === "overdue" ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground",
            )}
          >
            {detailLabel(item, tone)}
          </div>
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
  );
}

function Group({
  title,
  items,
  tone,
  today,
}: {
  title: string;
  items: TestsItem[];
  tone: Tone;
  today: string;
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <h2
        className={cn(
          "text-xs font-semibold uppercase tracking-wide",
          tone === "overdue" ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground",
        )}
      >
        {title}
      </h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <TestRow key={item.assessment.id} item={item} tone={tone} today={today} />
        ))}
      </ul>
    </section>
  );
}

/** Tests tab: what to give out today, what's still not taken, what to mark. */
export default async function TeacherAppTestsPage() {
  const { supabase, teacherId } = await requireCompanionTeacher();
  const today = athensToday();
  const groups = await loadTestsView(supabase, teacherId, today);
  const nothing =
    groups.overdue.length + groups.today.length + groups.upcoming.length === 0;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Tests</h1>

      <Group title="Not taken yet" items={groups.overdue} tone="overdue" today={today} />
      <Group title="Today" items={groups.today} tone="today" today={today} />
      <Group
        title={`Next ${UPCOMING_DAYS} days`}
        items={groups.upcoming}
        tone="upcoming"
        today={today}
      />

      {nothing && (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="font-medium">No tests to give out</p>
          <p className="mt-1 text-xs text-muted-foreground">
            New tests are set up in the full console.
          </p>
        </div>
      )}

      {groups.awaitingMarks.length > 0 && (
        <details className="group rounded-lg border border-border bg-card">
          <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span className="flex-1">Waiting for marks</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {groups.awaitingMarks.length}
            </span>
            <ChevronDown
              className="size-4 text-muted-foreground transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <ul className="space-y-2 px-3 pb-3">
            {groups.awaitingMarks.map((item) => (
              <TestRow key={item.assessment.id} item={item} tone="marks" today={today} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
