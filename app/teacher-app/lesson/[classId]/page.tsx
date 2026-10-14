import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { LessonAttendance } from "@/components/teacher-app/lesson-attendance";
import { HomeworkPanel } from "@/components/teacher-app/homework-panel";
import { LastHomework } from "@/components/teacher-app/last-homework";
import { formatCompanionDate } from "@/components/teacher-app/format";
import { requireCompanionTeacher, parseDateParam } from "@/app/teacher-app/session";
import { loadHomeworkView, loadLesson } from "@/lib/teacher-app/load";
import { athensToday } from "@/lib/push/athens-time";
import { cn } from "@/lib/utils";

/** One lesson: take attendance, or (Homework segment) set homework for its class. */
export default async function TeacherAppLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ date?: string | string[]; tab?: string | string[] }>;
}) {
  const { supabase, teacherId } = await requireCompanionTeacher();
  const [{ classId }, query] = await Promise.all([params, searchParams]);
  const today = athensToday();
  const date = parseDateParam(query.date) ?? today;
  const tab = query.tab === "homework" ? "homework" : "attendance";

  const lesson = await loadLesson(supabase, teacherId, classId, date);
  if (!lesson) notFound();
  const homeworkView =
    tab === "homework" ? await loadHomeworkView(supabase, teacherId, today, classId) : null;

  const backHref = date === today ? "/teacher-app" : `/teacher-app?date=${date}`;
  const lessonHref = `/teacher-app/lesson/${classId}?date=${date}`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href={backHref}
          aria-label="Back to the day's lessons"
          className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md active:bg-muted"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{lesson.classItem.name}</h1>
          <p className="text-xs text-muted-foreground">
            {formatCompanionDate(date)}
            {lesson.timeLabel && ` · ${lesson.timeLabel}`}
          </p>
        </div>
      </div>

      <nav aria-label="Lesson sections" className="grid grid-cols-2 rounded-lg bg-muted p-1">
        {(
          [
            ["attendance", "Attendance", lessonHref],
            ["homework", "Homework", `${lessonHref}&tab=homework`],
          ] as const
        ).map(([value, label, href]) => (
          <Link
            key={value}
            href={href}
            replace
            aria-current={tab === value ? "page" : undefined}
            className={cn(
              "flex h-10 items-center justify-center rounded-md text-sm font-medium",
              tab === value ? "bg-background shadow-sm" : "text-muted-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      {tab === "homework" && homeworkView ? (
        <HomeworkPanel
          classes={homeworkView.classes}
          todayClassIds={homeworkView.todayClassIds}
          selectedClassId={homeworkView.selectedClassId}
          initialHomework={homeworkView.homework}
          nextLessonDates={homeworkView.nextLessonDates}
          today={today}
          classPicker={false}
        />
      ) : lesson.hasLesson ? (
        <div className="space-y-4">
          <LastHomework
            homework={lesson.lastHomework}
            today={today}
            homeworkHref={`${lessonHref}&tab=homework`}
          />
          <LessonAttendance
            // Fresh server marks (e.g. after queued marks are sent and the
            // page refreshes) restart the cards from the saved state.
            key={JSON.stringify(lesson.statuses)}
            classId={lesson.classItem.id}
            className={lesson.classItem.name}
            date={date}
            isTwoHour={lesson.isTwoHour}
            isPerLesson={lesson.classItem.billingType === "per_lesson"}
            roster={lesson.roster}
            initialMarks={lesson.statuses}
          />
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          This class has no lesson on {formatCompanionDate(date)}.
        </p>
      )}
    </div>
  );
}
