import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";

import { DateStrip } from "@/components/teacher-app/date-strip";
import { DeviceNotifications } from "@/components/teacher-app/device-notifications";
import { formatCompanionDate } from "@/components/teacher-app/format";
import { requireCompanionTeacher, parseDateParam } from "@/app/teacher-app/session";
import { loadDay } from "@/lib/teacher-app/load";
import { athensMinutesNow, athensToday } from "@/lib/push/athens-time";
import { lessonInProgress, type DayLesson } from "@/lib/teacher-app/day";
import { TrialOutcomeButtons } from "@/components/teacher-app/trial-outcome";

// Same palette as the console's Calendar tab (components/teacher-calendar.tsx
// WEEK_ROW_CLASSES), so a lesson's kind reads the same on both. A plain
// recurring lesson keeps the neutral card.
const KIND_STYLES = {
  extra_session: {
    label: "Extra",
    row: "border-teal-500/40 bg-teal-500/10",
    chip: "bg-teal-500/15 text-teal-800 dark:text-teal-300",
  },
  ad_hoc_lesson: {
    label: "One-off",
    row: "border-violet-500/40 bg-violet-500/10",
    chip: "bg-violet-500/15 text-violet-800 dark:text-violet-300",
  },
  trial_lesson: {
    label: "Trial",
    row: "border-amber-500/40 bg-amber-500/10",
    chip: "bg-amber-500/20 text-amber-900 dark:text-amber-300",
  },
  block: {
    label: "Personal",
    row: "border-sky-500/40 bg-sky-500/10",
    chip: "bg-sky-500/15 text-sky-800 dark:text-sky-300",
  },
} as const;

function KindChip({ kind }: { kind: keyof typeof KIND_STYLES }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        KIND_STYLES[kind].chip,
      )}
    >
      {KIND_STYLES[kind].label}
    </span>
  );
}

const STATUS_LABELS: Record<string, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  split: "1+1",
};
import { cn } from "@/lib/utils";
import {
  CANCELLATION_REASON_LABELS_EN,
  breakDisplayRange,
  cancelledLessonLabel,
  isHolidayReason,
} from "@/lib/school-closures";

/** Today: the day's lessons, each opening its attendance and homework. */
export default async function TeacherAppTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[]; open?: string | string[] }>;
}) {
  const { supabase, teacherId } = await requireCompanionTeacher();
  const query = await searchParams;
  const today = athensToday();
  const date = parseDateParam(query.date) ?? today;
  const day = await loadDay(supabase, teacherId, date);
  const now = date === today ? lessonInProgress(day.lessons, athensMinutesNow()) : null;
  // A holiday's cancelled lessons are shown as its block, not one by one; a
  // class restored on its own is back among the lessons.
  const lessons = day.lessons.filter(
    (lesson) => !(lesson.kind === "cancelled" && isHolidayReason(lesson.cancellationReason)),
  );
  // Classes, one-off lessons, trials and personal blocks in one time-ordered
  // list; an all-day block (no start time) comes first.
  const items = [
    ...lessons.map((lesson) => ({ type: "class" as const, lesson, start: lesson.startTime })),
    ...day.eventLessons.map((lesson) => ({
      type: "event" as const,
      lesson,
      start: lesson.startTime,
    })),
  ].sort((a, b) => (a.start ?? "").localeCompare(b.start ?? ""));

  // Opening the app (/start adds ?open=1) during a lesson goes straight to
  // it; the tab bar and "back" link to plain /teacher-app, so they never jump.
  if (query.open === "1" && now) {
    redirect(`/teacher-app/lesson/${now.classId}?date=${date}`);
  }

  const renderClassLesson = (lesson: DayLesson) => {
    const cancelled = lesson.kind === "cancelled";
    const allMarked = lesson.rosterSize > 0 && lesson.marked >= lesson.rosterSize;
    const body = (
      <>
        <div className="w-20 shrink-0 text-sm font-semibold tabular-nums">
          {lesson.timeLabel ?? "—"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("truncate font-medium", cancelled && "line-through")}>
              {lesson.className}
            </span>
            {lesson.kind === "extra_session" && <KindChip kind="extra_session" />}
            {now?.classId === lesson.classId && (
              <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-foreground">
                Now
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {cancelled
              ? cancelledLessonLabel(
                  lesson.cancellationReason,
                  "Cancelled",
                  CANCELLATION_REASON_LABELS_EN,
                )
              : `${lesson.marked}/${lesson.rosterSize} marked` +
                (lesson.absent > 0 ? ` · ${lesson.absent} absent` : "")}
          </div>
        </div>
        {!cancelled && (
          <>
            <span
              className={cn(
                "size-2.5 shrink-0 rounded-full",
                allMarked ? "bg-emerald-500" : "bg-amber-400",
              )}
              aria-hidden="true"
            />
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
          </>
        )}
      </>
    );
    return (
      <li key={lesson.classId}>
        {cancelled ? (
          <div className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 text-muted-foreground">
            {body}
          </div>
        ) : (
          <Link
            href={`/teacher-app/lesson/${lesson.classId}?date=${date}`}
            className={cn(
              "flex min-h-16 items-center gap-3 rounded-lg border px-4 active:bg-muted",
              lesson.kind === "extra_session"
                ? KIND_STYLES.extra_session.row
                : "border-border bg-card",
            )}
          >
            {body}
          </Link>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <DateStrip
        date={date}
        today={today}
        previous={day.previous}
        next={day.next}
        basePath="/teacher-app"
      />

      {day.holidays.map((holiday) => {
        const range = breakDisplayRange(holiday);
        return (
          <div
            key={`${holiday.reason}|${holiday.closureIds.join(",")}`}
            className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
          >
            <p className="font-medium">
              {CANCELLATION_REASON_LABELS_EN[holiday.reason]}
              {holiday.note ? ` · ${holiday.note}` : ""}
            </p>
            <p className="text-xs text-muted-foreground">
              {range.from !== range.to
                ? `${formatCompanionDate(range.from)} – ${formatCompanionDate(range.to)} · `
                : ""}
              No lessons · {holiday.lessons.length} cancelled
            </p>
          </div>
        );
      })}

      {items.length === 0 && day.holidays.length > 0 ? (
        day.next && (
          <Link
            href={`/teacher-app?date=${day.next}`}
            className="inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            Next lessons: {formatCompanionDate(day.next)}
          </Link>
        )
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="font-medium">No lessons {date === today ? "today" : "this day"}</p>
          {day.next && (
            <Link
              href={`/teacher-app?date=${day.next}`}
              className="mt-2 inline-block text-sm font-medium text-brand underline-offset-4 hover:underline"
            >
              Next lessons: {formatCompanionDate(day.next)}
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) =>
            item.type === "event" ? (
              <li key={item.lesson.eventId}>
                {item.lesson.kind === "ad_hoc_lesson" ? (
                  <Link
                    href={`/teacher-app/one-off/${item.lesson.eventId}`}
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-lg border px-4 active:bg-muted",
                      KIND_STYLES.ad_hoc_lesson.row,
                    )}
                  >
                    <div className="w-20 shrink-0 text-sm font-semibold tabular-nums">
                      {item.lesson.timeLabel ?? "—"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{item.lesson.name}</span>
                        <KindChip kind="ad_hoc_lesson" />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.lesson.status
                          ? (STATUS_LABELS[item.lesson.status] ?? item.lesson.status)
                          : "Not marked"}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "size-2.5 shrink-0 rounded-full",
                        item.lesson.status ? "bg-emerald-500" : "bg-amber-400",
                      )}
                      aria-hidden="true"
                    />
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </Link>
                ) : item.lesson.kind === "trial_lesson" ? (
                  <div
                    className={cn(
                      "flex min-h-16 items-center gap-3 rounded-lg border px-4",
                      KIND_STYLES.trial_lesson.row,
                    )}
                  >
                    <div className="w-20 shrink-0 text-sm font-semibold tabular-nums">
                      {item.lesson.timeLabel ?? "—"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{item.lesson.name}</span>
                        <KindChip kind="trial_lesson" />
                      </div>
                    </div>
                    <TrialOutcomeButtons
                      eventId={item.lesson.eventId}
                      initialOutcome={item.lesson.trialOutcome}
                    />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-lg border px-4 py-2",
                      KIND_STYLES.block.row,
                    )}
                  >
                    <div className="w-20 shrink-0 text-sm font-semibold tabular-nums">
                      {item.lesson.timeLabel ?? "All day"}
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="truncate font-medium">{item.lesson.name}</span>
                      <KindChip kind="block" />
                    </div>
                  </div>
                )}
              </li>
            ) : (
              renderClassLesson(item.lesson)
            ),
          )}
        </ul>
      )}

      <DeviceNotifications />
    </div>
  );
}
