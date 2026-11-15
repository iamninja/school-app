import { FlameIcon, Gamepad2Icon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParentPracticeSummary } from "@/lib/practice-progress";

/** A child's practice this week, for their parents. */
export function ParentPracticeCard({ summary, name }: { summary: ParentPracticeSummary; name: string }) {
  const percent = summary.weekAnswers ? Math.round((summary.weekRight / summary.weekAnswers) * 100) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gamepad2Icon className="size-4 text-brand" aria-hidden="true" />
          Εξάσκηση
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/60 px-2 py-3">
            <p className="text-xl font-semibold tabular-nums">{summary.weekDays}</p>
            <p className="text-xs text-muted-foreground">{summary.weekDays === 1 ? "μέρα" : "μέρες"} αυτή την εβδομάδα</p>
          </div>
          <div className="rounded-xl bg-muted/60 px-2 py-3">
            <p className="text-xl font-semibold tabular-nums">{summary.weekAnswers}</p>
            <p className="text-xs text-muted-foreground">απαντήσεις</p>
          </div>
          <div className="rounded-xl bg-muted/60 px-2 py-3">
            <p className="text-xl font-semibold tabular-nums">{percent === null ? "–" : `${percent}%`}</p>
            <p className="text-xs text-muted-foreground">σωστές</p>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {summary.dailyStreak ? (
            <span className="inline-flex items-center gap-1">
              <FlameIcon className="size-4 text-orange-500" aria-hidden="true" />
              {summary.dailyStreak} {summary.dailyStreak === 1 ? "μέρα" : "μέρες"} στη σειρά
            </span>
          ) : (
            <span>{summary.weekAnswers ? `${name} δεν έχει εξασκηθεί σήμερα.` : `${name} δεν έχει εξασκηθεί αυτή την εβδομάδα.`}</span>
          )}
          {summary.mistakes ? <span>· {summary.mistakes} ερωτήσεις να ξαναδεί</span> : null}
        </p>
      </CardContent>
    </Card>
  );
}
