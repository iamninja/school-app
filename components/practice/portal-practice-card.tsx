import Link from "next/link";
import { FlameIcon, Gamepad2Icon, StarIcon, TargetIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PracticeSummary } from "@/lib/practice-progress";

const TEXT = {
  el: {
    title: "Εξάσκηση",
    keepStreak: "Κράτα το σερί σου - ένας γύρος είναι 10 ερωτήσεις.",
    newStreak: "Ένας γύρος σήμερα ξεκινά νέο σερί.",
    intro: "Γύροι 10 ερωτήσεων από τις ενότητες της τάξης σου, όσες φορές θέλεις.",
    days: (n: number) => `${n} ${n === 1 ? "μέρα" : "μέρες"}`,
    daysTitle: "Μέρες στη σειρά",
    points: "Πόντοι",
    mistakesTitle: "Ερωτήσεις να ξαναδείς",
    mistakes: (n: number) => `${n} λάθη να ξαναδείς`,
    play: "Παίξε έναν γύρο",
  },
  en: {
    title: "Practice",
    keepStreak: "Keep your streak going - a round is 10 questions.",
    newStreak: "A round today starts a new streak.",
    intro: "Rounds of 10 questions from your grade's sections, as often as you like.",
    days: (n: number) => `${n} ${n === 1 ? "day" : "days"}`,
    daysTitle: "Days in a row",
    points: "Points",
    mistakesTitle: "Questions to look at again",
    mistakes: (n: number) => `${n} ${n === 1 ? "mistake" : "mistakes"} to review`,
    play: "Play a round",
  },
};

/** The student home's way into practice: streak, points, mistakes, play. */
export function PortalPracticeCard({ summary, locale = "el" }: { summary: PracticeSummary; locale?: "el" | "en" }) {
  if (!summary.available) return null;
  const t = TEXT[locale];
  const started = summary.points > 0 || summary.mistakes > 0;
  return (
    <Card className="overflow-hidden border-brand/40 bg-brand/5">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-brand-foreground">
            <Gamepad2Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold">{t.title}</p>
            <p className="text-sm text-muted-foreground">
              {started
                ? summary.dailyStreak > 0
                  ? t.keepStreak
                  : t.newStreak
                : t.intro}
            </p>
            {started ? (
              <p className="mt-2 flex flex-wrap gap-3 text-sm font-semibold tabular-nums">
                <span className="inline-flex items-center gap-1" title={t.daysTitle}>
                  <FlameIcon className="size-4 text-orange-500" aria-hidden="true" />
                  {t.days(summary.dailyStreak)}
                </span>
                <span className="inline-flex items-center gap-1" title={t.points}>
                  <StarIcon className="size-4 text-brand" aria-hidden="true" />
                  {summary.points}
                </span>
                {summary.mistakes ? (
                  <span className="inline-flex items-center gap-1" title={t.mistakesTitle}>
                    <TargetIcon className="size-4 text-red-500" aria-hidden="true" />
                    {t.mistakes(summary.mistakes)}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link href="/practice">{t.play}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
