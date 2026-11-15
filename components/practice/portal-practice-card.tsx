import Link from "next/link";
import { FlameIcon, Gamepad2Icon, StarIcon, TargetIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { PracticeSummary } from "@/lib/practice-progress";

/** The student home's way into practice: streak, points, mistakes, play. */
export function PortalPracticeCard({ summary }: { summary: PracticeSummary }) {
  if (!summary.available) return null;
  const started = summary.points > 0 || summary.mistakes > 0;
  return (
    <Card className="overflow-hidden border-brand/40 bg-brand/5">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand text-brand-foreground">
            <Gamepad2Icon className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-lg font-bold">Εξάσκηση</p>
            <p className="text-sm text-muted-foreground">
              {started
                ? summary.dailyStreak > 0
                  ? "Κράτα το σερί σου - ένας γύρος είναι 10 ερωτήσεις."
                  : "Ένας γύρος σήμερα ξεκινά νέο σερί."
                : "Γύροι 10 ερωτήσεων από τις ενότητες της τάξης σου, όσες φορές θέλεις."}
            </p>
            {started ? (
              <p className="mt-2 flex flex-wrap gap-3 text-sm font-semibold tabular-nums">
                <span className="inline-flex items-center gap-1" title="Μέρες στη σειρά">
                  <FlameIcon className="size-4 text-orange-500" aria-hidden="true" />
                  {summary.dailyStreak} {summary.dailyStreak === 1 ? "μέρα" : "μέρες"}
                </span>
                <span className="inline-flex items-center gap-1" title="Πόντοι">
                  <StarIcon className="size-4 text-brand" aria-hidden="true" />
                  {summary.points}
                </span>
                {summary.mistakes ? (
                  <span className="inline-flex items-center gap-1" title="Ερωτήσεις να ξαναδείς">
                    <TargetIcon className="size-4 text-red-500" aria-hidden="true" />
                    {summary.mistakes} λάθη να ξαναδείς
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        </div>
        <Button asChild size="lg" className="shrink-0">
          <Link href="/practice">Παίξε έναν γύρο</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
