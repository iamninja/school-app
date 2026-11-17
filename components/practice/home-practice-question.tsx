"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckIcon, XIcon } from "lucide-react";

import { MathText } from "@/components/math-text";
import { PracticeFigure } from "@/components/practice/practice-figure";
import { PracticeOriginBadge } from "@/components/practice/practice-origin-badge";
import type { RoundQuestion } from "@/lib/practice-server";
import { cn } from "@/lib/utils";

/**
 * The homepage's taste of practice: one real question from the public
 * sections (multiple choice or true/false). A tap shows whether it's
 * right, the explanation, and the way into /practice.
 */
export function HomePracticeQuestion({ question, gradeLabel, className }: { question: RoundQuestion; gradeLabel?: string | null; className?: string }) {
  const [picked, setPicked] = React.useState<number | null>(null);
  const choices =
    question.type === "choice"
      ? question.options.map((option) => ({ text: option.text, correct: option.correct }))
      : [
          { text: "Σωστό", correct: question.answer === 1 },
          { text: "Λάθος", correct: question.answer === 0 },
        ];
  const answered = picked !== null;
  const right = answered && choices[picked].correct;

  return (
    <div className={cn("rounded-3xl border border-border/80 bg-card p-5 shadow-lg", className)}>
      <p className="truncate text-xs font-semibold text-muted-foreground">
        {gradeLabel ? `${gradeLabel} · ` : ""}
        {question.sectionName}
      </p>
      {question.originLabel ? <PracticeOriginBadge label={question.originLabel} className="mt-2" /> : null}
      <p className="mt-3 whitespace-pre-line text-lg font-bold leading-snug">
        <MathText text={question.prompt} />
      </p>
      {question.figure ? <PracticeFigure source={question.figure} className="mt-3 max-w-[260px]" /> : null}
      <div className="mt-4 grid gap-2">
        {choices.map((choice, index) => {
          const showRight = answered && choice.correct;
          const showWrong = answered && picked === index && !choice.correct;
          return (
            <button
              key={index}
              type="button"
              disabled={answered}
              onClick={() => setPicked(index)}
              className={cn(
                "flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left text-sm font-medium transition",
                showRight
                  ? "border-emerald-500 bg-emerald-500/10"
                  : showWrong
                    ? "border-red-500 bg-red-500/10"
                    : "border-border bg-background/60 enabled:hover:border-brand/70",
                answered && !showRight && !showWrong && "opacity-60",
              )}
            >
              {question.type === "choice" ? (
                <span className="grid size-6 shrink-0 place-items-center rounded-lg border text-[11px] font-bold text-muted-foreground">
                  {"ΑΒΓΔΕΣ"[index]}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <MathText text={choice.text} />
              </span>
              {showRight ? <CheckIcon className="size-4 shrink-0 text-emerald-600" aria-label="Σωστή απάντηση" /> : null}
              {showWrong ? <XIcon className="size-4 shrink-0 text-red-600" aria-label="Λάθος απάντηση" /> : null}
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className={cn("mt-4 space-y-3 rounded-2xl px-3 py-3", right ? "bg-emerald-500/10" : "bg-red-500/10")} role="status">
          <p className={cn("text-sm font-bold", right ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
            {right ? "Σωστό!" : "Όχι ακριβώς."}
          </p>
          {question.explanation ? (
            <p className="text-sm text-muted-foreground">
              <MathText text={question.explanation} />
            </p>
          ) : null}
          <Link
            href="/practice"
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-sm font-bold text-brand-foreground"
          >
            Συνέχισε με έναν γύρο <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Πάτησε μια απάντηση.</p>
      )}
    </div>
  );
}
