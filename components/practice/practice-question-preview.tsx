"use client";

import { CheckIcon } from "lucide-react";

import { MathText } from "@/components/math-text";
import { PracticeGraphView } from "@/components/practice/practice-graph";
import { formatNumber, type PlayableQuestion } from "@/lib/practice-template";
import { cn } from "@/lib/utils";

const fmt = (value: number) => formatNumber(value, false);

/** One played version of a question, answer shown - for the editor and the list. */
export function PracticeQuestionPreview({
  question,
  imageUrl,
  compact = false,
}: {
  question: PlayableQuestion;
  imageUrl?: string | null;
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className={cn("whitespace-pre-line font-medium", compact ? "text-sm" : "text-base")}>
        <MathText text={question.prompt} />
      </p>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- public bucket URL, any size
        <img src={imageUrl} alt="" className="max-h-48 rounded-md border object-contain" />
      ) : null}

      {question.type === "choice" ? (
        <ul className="grid gap-1.5">
          {question.options.map((option, index) => (
            <li
              key={index}
              className={cn(
                "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                option.correct && "border-emerald-500/60 bg-emerald-500/10",
              )}
            >
              <span className="w-4 text-xs font-semibold text-muted-foreground">{"ΑΒΓΔΕΣ"[index]}</span>
              <span className="flex-1">
                <MathText text={option.text} />
              </span>
              {option.correct ? <CheckIcon className="size-4 text-emerald-600" aria-label="Σωστή" /> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {question.type === "true_false" ? (
        <p className="text-sm">
          Απάντηση: <strong>{question.answer ? "Σωστό" : "Λάθος"}</strong>
        </p>
      ) : null}

      {question.type === "number" ? (
        <p className="text-sm">
          Απάντηση: <strong className="tabular-nums">{fmt(question.answer)}</strong>
          {question.tolerance ? <span className="text-muted-foreground"> (±{fmt(question.tolerance)})</span> : null}
        </p>
      ) : null}

      {question.type === "slider" && question.slider ? (
        <div className="space-y-1">
          <div className="relative h-2 rounded-full bg-muted">
            <div
              className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full border border-emerald-500 bg-emerald-500/20"
              style={{
                left: `${((question.answer - question.tolerance - question.slider.min) / (question.slider.max - question.slider.min)) * 100}%`,
                width: `${((2 * question.tolerance) / (question.slider.max - question.slider.min)) * 100}%`,
              }}
            />
            <div
              className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-600"
              style={{ left: `${((question.answer - question.slider.min) / (question.slider.max - question.slider.min)) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>{fmt(question.slider.min)}</span>
            <span>
              Απάντηση {fmt(question.answer)} ± {fmt(question.tolerance)}
            </span>
            <span>{fmt(question.slider.max)}</span>
          </div>
        </div>
      ) : null}

      {question.type === "point" && question.graph ? (
        <div className="space-y-1">
          <PracticeGraphView
            graph={question.graph}
            point={{ x: question.answer, y: question.answerY }}
            className={cn("w-full", compact ? "max-w-[220px]" : "max-w-[300px]")}
          />
          <p className="text-sm">
            Απάντηση:{" "}
            <strong className="tabular-nums">
              ({fmt(question.answer)}, {fmt(question.answerY)})
            </strong>
            <span className="text-muted-foreground"> (±{fmt(question.tolerance)})</span>
          </p>
        </div>
      ) : null}

      {question.explanation ? (
        <p className="whitespace-pre-line rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          <MathText text={question.explanation} />
        </p>
      ) : null}
    </div>
  );
}
