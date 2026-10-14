import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { DateStrip } from "@/components/teacher-app/date-strip";
import { DeviceNotifications } from "@/components/teacher-app/device-notifications";
import { formatCompanionDate } from "@/components/teacher-app/format";
import { requireCompanionTeacher, parseDateParam } from "@/app/teacher-app/session";
import { loadDay } from "@/lib/teacher-app/load";
import { athensToday } from "@/lib/push/athens-time";
import { cn } from "@/lib/utils";

/** Today: the day's lessons, each opening its attendance and homework. */
export default async function TeacherAppTodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { supabase, teacherId } = await requireCompanionTeacher();
  const today = athensToday();
  const date = parseDateParam((await searchParams).date) ?? today;
  const day = await loadDay(supabase, teacherId, date);

  return (
    <div className="space-y-4">
      <DateStrip
        date={date}
        today={today}
        previous={day.previous}
        next={day.next}
        basePath="/teacher-app"
      />

      {day.lessons.length === 0 ? (
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
          {day.lessons.map((lesson) => {
            const cancelled = lesson.kind === "cancelled";
            const allMarked = lesson.rosterSize > 0 && lesson.marked >= lesson.rosterSize;
            const body = (
              <>
                <div className="w-20 shrink-0 text-sm font-semibold tabular-nums">
                  {lesson.timeLabel ?? "—"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cn("truncate font-medium", cancelled && "line-through")}>
                    {lesson.className}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {cancelled
                      ? "Cancelled"
                      : `${lesson.marked}/${lesson.rosterSize} marked` +
                        (lesson.absent > 0 ? ` · ${lesson.absent} absent` : "") +
                        (lesson.kind === "extra_session" ? " · Extra" : "")}
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
                    className="flex min-h-16 items-center gap-3 rounded-lg border border-border bg-card px-4 active:bg-muted"
                  >
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <DeviceNotifications />
    </div>
  );
}
