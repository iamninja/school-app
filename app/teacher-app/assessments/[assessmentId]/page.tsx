import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AssessmentRoster } from "@/components/teacher-app/assessment-roster";
import { formatCompanionDate } from "@/components/teacher-app/format";
import { TestKindChip } from "@/components/teacher-app/tests-kind";
import { requireCompanionTeacher } from "@/app/teacher-app/session";
import { loadTestsAssessment } from "@/lib/teacher-app/load";
import { athensDateAndTime, athensToday } from "@/lib/push/athens-time";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One test: its students, each marked "taken" with one tap. */
export default async function TeacherAppTestPage({
  params,
}: {
  params: Promise<{ assessmentId: string }>;
}) {
  const { assessmentId } = await params;
  if (!UUID.test(assessmentId)) notFound();
  const { supabase, teacherId } = await requireCompanionTeacher();
  const view = await loadTestsAssessment(supabase, teacherId, assessmentId);
  if (!view) notFound();
  const { assessment, roster } = view;
  const today = athensToday();

  const when =
    assessment.kind === "mock_exam"
      ? { date: assessment.scheduled_date, time: assessment.scheduled_time }
      : assessment.deadline_at
        ? athensDateAndTime(assessment.deadline_at)
        : { date: null, time: null };
  const whenText = when.date
    ? `${assessment.kind === "short_assessment" ? "Due " : ""}${
        when.date === today ? "Today" : formatCompanionDate(when.date)
      }${when.time ? ` · ${when.time}` : ""}`
    : "Open - no deadline";

  return (
    <div className="space-y-4">
      <Link
        href="/teacher-app/assessments"
        className="-ml-1 inline-flex items-center gap-0.5 text-sm text-muted-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        Tests
      </Link>

      <header className="space-y-1">
        <div className="flex items-start gap-2">
          <h1 className="min-w-0 flex-1 text-lg font-semibold leading-tight">{assessment.title}</h1>
          <TestKindChip kind={assessment.kind} />
        </div>
        <p className="text-sm text-muted-foreground">
          {[
            assessment.class_name,
            whenText,
            `${assessment.duration_minutes}′`,
            `out of ${Number(assessment.max_score)}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {assessment.description && (
          <p className="text-sm text-muted-foreground">{assessment.description}</p>
        )}
      </header>

      {roster.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center">
          <p className="font-medium">No students on this test</p>
        </div>
      ) : (
        <AssessmentRoster
          // Fresh state when a refresh brings new rows (another device).
          key={roster.map((row) => `${row.id}:${row.status}:${row.score}`).join("|")}
          assessmentId={assessment.id}
          kind={assessment.kind}
          maxScore={Number(assessment.max_score)}
          defaultWhen={when}
          notifyByDefault={!assessment.notifications_disabled}
          initialRoster={roster}
        />
      )}
    </div>
  );
}
