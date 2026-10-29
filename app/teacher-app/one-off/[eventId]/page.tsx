import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { LessonAttendance } from "@/components/teacher-app/lesson-attendance";
import { formatCompanionDate } from "@/components/teacher-app/format";
import { requireCompanionTeacher } from "@/app/teacher-app/session";
import { loadLessonTasks, loadOneOffLesson } from "@/lib/teacher-app/load";
import { CompanionTasks } from "@/components/teacher-app/task-list";
import { athensToday } from "@/lib/push/athens-time";
import { ONE_OFF_CLASS_NAME } from "@/lib/attendance-records";

/** A one-off lesson: attendance for its one student (no class, so no homework tab). */
export default async function TeacherAppOneOffPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { supabase, teacherId } = await requireCompanionTeacher();
  const { eventId } = await params;
  const lesson = await loadOneOffLesson(supabase, teacherId, eventId);
  if (!lesson) notFound();
  const lessonTasks = await loadLessonTasks(supabase, teacherId, lesson.date, { eventId });

  const today = athensToday();
  const backHref = lesson.date === today ? "/teacher-app" : `/teacher-app?date=${lesson.date}`;

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
          <h1 className="truncate text-lg font-semibold">{lesson.studentName}</h1>
          <p className="text-xs text-muted-foreground">
            One-off lesson · {formatCompanionDate(lesson.date)}
            {lesson.timeLabel && ` · ${lesson.timeLabel}`}
          </p>
        </div>
      </div>

      {lessonTasks.lessonRef && (
        <CompanionTasks
          key={JSON.stringify(lessonTasks.tasks.map((task) => [task.id, task.done_at]))}
          title="Tasks"
          target={{ kind: "lesson", date: lesson.date, lesson: lessonTasks.lessonRef }}
          tasks={lessonTasks.tasks}
        />
      )}

      {lesson.student ? (
        <LessonAttendance
          key={JSON.stringify(lesson.statuses)}
          classId=""
          className={ONE_OFF_CLASS_NAME}
          eventId={lesson.eventId}
          date={lesson.date}
          isTwoHour={lesson.isTwoHour}
          isPerLesson={lesson.isCharged}
          roster={[lesson.student]}
          initialMarks={lesson.statuses}
        />
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          {lesson.studentName} is no longer an active student.
        </p>
      )}
    </div>
  );
}
