import { FlameIcon, Gamepad2Icon } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParentPracticeSummary } from "@/lib/practice-progress";

const TEXT = {
  el: {
    title: "Εξάσκηση",
    weekDays: (n: number) => `${n === 1 ? "μέρα" : "μέρες"} αυτή την εβδομάδα`,
    answers: "απαντήσεις",
    right: "σωστές",
    streak: (n: number) => `${n} ${n === 1 ? "μέρα" : "μέρες"} στη σειρά`,
    notToday: (name: string) => `${name} δεν έχει εξασκηθεί σήμερα.`,
    notThisWeek: (name: string) => `${name} δεν έχει εξασκηθεί αυτή την εβδομάδα.`,
    mistakes: (n: number) => `· ${n} ερωτήσεις να ξαναδεί`,
  },
  en: {
    title: "Practice",
    weekDays: (n: number) => `${n === 1 ? "day" : "days"} this week`,
    answers: "answers",
    right: "right",
    streak: (n: number) => `${n} ${n === 1 ? "day" : "days"} in a row`,
    notToday: (name: string) => `${name} hasn't practised today.`,
    notThisWeek: (name: string) => `${name} hasn't practised this week.`,
    mistakes: (n: number) => `· ${n} ${n === 1 ? "question" : "questions"} to look at again`,
  },
};

/** A child's practice this week, for their parents. */
export function ParentPracticeCard({ summary, name, locale = "el" }: { summary: ParentPracticeSummary; name: string; locale?: "el" | "en" }) {
  const t = TEXT[locale];
  const percent = summary.weekAnswers ? Math.round((summary.weekRight / summary.weekAnswers) * 100) : null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gamepad2Icon className="size-4 text-brand" aria-hidden="true" />
          {t.title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-muted/60 px-2 py-3">
            <p className="text-xl font-semibold tabular-nums">{summary.weekDays}</p>
            <p className="text-xs text-muted-foreground">{t.weekDays(summary.weekDays)}</p>
          </div>
          <div className="rounded-xl bg-muted/60 px-2 py-3">
            <p className="text-xl font-semibold tabular-nums">{summary.weekAnswers}</p>
            <p className="text-xs text-muted-foreground">{t.answers}</p>
          </div>
          <div className="rounded-xl bg-muted/60 px-2 py-3">
            <p className="text-xl font-semibold tabular-nums">{percent === null ? "–" : `${percent}%`}</p>
            <p className="text-xs text-muted-foreground">{t.right}</p>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {summary.dailyStreak ? (
            <span className="inline-flex items-center gap-1">
              <FlameIcon className="size-4 text-orange-500" aria-hidden="true" />
              {t.streak(summary.dailyStreak)}
            </span>
          ) : (
            <span>{summary.weekAnswers ? t.notToday(name) : t.notThisWeek(name)}</span>
          )}
          {summary.mistakes ? <span>{t.mistakes(summary.mistakes)}</span> : null}
        </p>
      </CardContent>
    </Card>
  );
}
