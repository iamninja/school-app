import { HomeworkPanel } from "@/components/teacher-app/homework-panel";
import { requireCompanionTeacher } from "@/app/teacher-app/session";
import { loadHomeworkView } from "@/lib/teacher-app/load";
import { athensToday } from "@/lib/push/athens-time";

/** Homework tab: pick a class (today's first), set homework, fix recent ones. */
export default async function TeacherAppHomeworkPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string | string[] }>;
}) {
  const { supabase, teacherId } = await requireCompanionTeacher();
  const requested = (await searchParams).class;
  const today = athensToday();
  const view = await loadHomeworkView(
    supabase,
    teacherId,
    today,
    typeof requested === "string" ? requested : null,
  );

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Homework</h1>
      <HomeworkPanel
        // A fresh panel per class: its list and form belong to that class.
        key={view.selectedClassId ?? "none"}
        classes={view.classes}
        todayClassIds={view.todayClassIds}
        selectedClassId={view.selectedClassId}
        initialHomework={view.homework}
        nextLessonDates={view.nextLessonDates}
        today={today}
        classPicker
      />
    </div>
  );
}
