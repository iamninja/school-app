"use client";

import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { el } from "date-fns/locale";
import { FlameIcon, TargetIcon } from "lucide-react";
import { toast } from "sonner";

import { getPracticeProgressOverviewAction } from "@/app/protected/teacher/practice-actions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getErrorMessage } from "@/lib/expected-error";
import type { PracticeStudentProgress } from "@/lib/practice-bank";
import { cn } from "@/lib/utils";

const percent = (right: number, total: number) => (total ? Math.round((right / total) * 100) : 0);

function AccuracyBar({ right, total }: { right: number; total: number }) {
  const value = percent(right, total);
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-500" : "bg-red-500")}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{value}%</span>
    </span>
  );
}

/**
 * Practice > Progress: every student's practice this week and overall,
 * most active first; pick one for their sections. Students who never
 * practised are listed at the end. Guests aren't recorded.
 */
export function PracticeProgressView({ initialRows }: { initialRows?: PracticeStudentProgress[] }) {
  const [rows, setRows] = React.useState<PracticeStudentProgress[] | null>(initialRows ?? null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (initialRows) return;
    getPracticeProgressOverviewAction()
      .then(setRows)
      .catch((error: unknown) => {
        setRows([]);
        toast.error(getErrorMessage(error, "Couldn't load practice progress"));
      });
  }, [initialRows]);

  if (rows === null) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const sorted = [...rows].sort(
    (a, b) => b.week.answers - a.week.answers || b.allTime.answers - a.allTime.answers || a.name.localeCompare(b.name, "el"),
  );
  const active = sorted.filter((row) => row.allTime.answers > 0);
  const weekStudents = rows.filter((row) => row.week.answers > 0).length;
  const weekAnswers = rows.reduce((sum, row) => sum + row.week.answers, 0);
  const weekRight = rows.reduce((sum, row) => sum + row.week.right, 0);
  const open = rows.find((row) => row.studentId === openId) ?? null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [String(weekStudents), `of ${rows.length} students practised this week`],
          [String(weekAnswers), "answers this week"],
          [weekAnswers ? `${percent(weekRight, weekAnswers)}%` : "–", "right this week"],
        ].map(([value, label]) => (
          <Card key={label}>
            <CardContent className="p-4">
              <p className="text-2xl font-semibold tabular-nums">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Students</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">No student has practised yet. Their rounds show up here once they play logged in.</p>
            ) : (
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Student</th>
                    <th className="py-2 pr-3 font-medium">This week</th>
                    <th className="py-2 pr-3 font-medium">Right</th>
                    <th className="py-2 pr-3 font-medium">Streak</th>
                    <th className="py-2 pr-3 font-medium">Mistakes</th>
                    <th className="py-2 font-medium">Last played</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((row) => (
                    <tr
                      key={row.studentId}
                      className={cn("cursor-pointer border-b last:border-0 hover:bg-muted/50", row.studentId === openId && "bg-muted/60")}
                      onClick={() => setOpenId(row.studentId === openId ? null : row.studentId)}
                    >
                      <td className="py-2 pr-3">
                        <button type="button" className="text-left font-medium hover:underline" aria-expanded={row.studentId === openId}>
                          {row.name}
                        </button>
                        <p className="text-xs text-muted-foreground">{row.classes.join(", ")}</p>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.week.answers ? `${row.week.answers} answers · ${row.week.days} day${row.week.days === 1 ? "" : "s"}` : <span className="text-muted-foreground">–</span>}
                      </td>
                      <td className="py-2 pr-3">
                        {row.week.answers ? <AccuracyBar right={row.week.right} total={row.week.answers} /> : <span className="text-muted-foreground">–</span>}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {row.dailyStreak ? (
                          <span className="inline-flex items-center gap-1"><FlameIcon className="size-3.5 text-orange-500" aria-hidden="true" />{row.dailyStreak}</span>
                        ) : "–"}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{row.mistakes || "–"}</td>
                      <td className="py-2 text-muted-foreground">
                        {row.lastPracticed ? formatDistanceToNowStrict(new Date(row.lastPracticed), { addSuffix: true, locale: el }) : "–"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {rows.length > active.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Not yet: {sorted.filter((row) => row.allTime.answers === 0).map((row) => row.name).join(", ")}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="text-base">{open ? open.name : "Pick a student"}</CardTitle>
          </CardHeader>
          <CardContent>
            {open ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{open.allTime.answers} answers in all · {percent(open.allTime.right, open.allTime.answers)}% right</Badge>
                  <Badge variant="outline">{open.points} points</Badge>
                  {open.mistakes ? (
                    <Badge variant="outline" className="gap-1"><TargetIcon className="size-3 text-red-500" aria-hidden="true" />{open.mistakes} to review</Badge>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Sections, last 30 days</p>
                  {open.sections.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nothing in the last 30 days.</p>
                  ) : (
                    open.sections.map((section) => (
                      <div key={section.sectionId} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">{section.name || "(deleted section)"}</span>
                        <span className="flex shrink-0 items-center gap-3">
                          <span className="text-xs tabular-nums text-muted-foreground">{section.answers}</span>
                          <AccuracyBar right={section.right} total={section.answers} />
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Their sections, accuracy and mistakes appear here.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
