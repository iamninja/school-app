"use client";

import * as React from "react";
import { format } from "date-fns";
import { CheckIcon, PencilIcon } from "lucide-react";
import { toast } from "sonner";

import { resolvePracticeReportAction } from "@/app/protected/teacher/practice-actions";
import { MathText } from "@/components/math-text";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/expected-error";
import type { PracticeReport } from "@/lib/practice-bank";

/** Practice > Reports: "something's wrong with this question", newest first. */
export function PracticeReportsView({
  reports,
  onResolved,
  onOpenQuestion,
}: {
  reports: PracticeReport[];
  onResolved: (id: string) => void;
  onOpenQuestion: (report: PracticeReport) => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  if (reports.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-muted-foreground">
          No open reports. When a student or guest taps &quot;Κάτι δεν πάει καλά;&quot; on a question, it shows up here.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <Card key={report.id}>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm">
                <span className="font-medium">{report.studentName ?? "A guest"}</span>
                <span className="text-muted-foreground"> · {format(new Date(report.createdAt), "d MMM, HH:mm")}</span>
              </p>
              {report.message ? <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">“{report.message}”</p> : null}
              <p className="whitespace-pre-line text-sm text-muted-foreground">
                <span className="text-xs uppercase tracking-wide">As played: </span>
                <MathText text={report.playedPrompt || report.questionPrompt} />
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenQuestion(report)}>
                <PencilIcon className="size-3.5" /> Open question
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy === report.id}
                onClick={async () => {
                  setBusy(report.id);
                  try {
                    await resolvePracticeReportAction(report.id);
                    onResolved(report.id);
                  } catch (error: unknown) {
                    toast.error(getErrorMessage(error, "Couldn't mark it done"));
                  } finally {
                    setBusy(null);
                  }
                }}
              >
                <CheckIcon className="size-3.5" /> Done
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
