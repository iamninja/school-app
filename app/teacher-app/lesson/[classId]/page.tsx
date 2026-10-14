import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { LessonAttendance } from "@/components/teacher-app/lesson-attendance";
import { formatCompanionDate } from "@/components/teacher-app/format";
import { requireCompanionTeacher, parseDateParam } from "@/app/teacher-app/session";
import { loadLesson } from "@/lib/teacher-app/load";
import { athensToday } from "@/lib/push/athens-time";

/** One lesson: take attendance (and, from the Homework segment, set homework). */
export default async function TeacherAppLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ classId: string }>;
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const { supabase, teacherId } = await requireCompanionTeacher();
  const [{ classId }, query] = await Promise.all([params, searchParams]);
  const today = athensToday();
  const date = parseDateParam(query.date) ?? today;

  const lesson = await loadLesson(supabase, teacherId, classId, date);
  if (!lesson) notFound();

  const backHref = date === today ? "/teacher-app" : `/teacher-app?date=${date}`;

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

      {lesson.hasLesson ? (
        <LessonAttendance
          classId={lesson.classItem.id}
          className={lesson.classItem.name}
          date={date}
          isTwoHour={lesson.isTwoHour}
          isPerLesson={lesson.classItem.billingType === "per_lesson"}
          roster={lesson.roster}
          initialMarks={lesson.statuses}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          This class has no lesson on {formatCompanionDate(date)}.
        </p>
      )}
    </div>
  );
}
