"use client";

import { CheckIcon } from "lucide-react";

import { MathText } from "@/components/math-text";
import { PracticeGraphView } from "@/components/practice/practice-graph";
import { PracticeOriginBadge } from "@/components/practice/practice-origin-badge";
import { exprToTex } from "@/lib/practice-expr";
import { formatInterval, formatNumber, type PlayableQuestion } from "@/lib/practice-template";
import { cn } from "@/lib/utils";

const fmt = (value: number) => formatNumber(value, false);

const mathOf = (text: string) => (text.includes("$") ? text : `$${text}$`);

function texOf(expression: string): string {
  try {
    return `$${exprToTex(expression)}$`;
  } catch {
    return expression;
  }
}

const MARKER_LABEL: Record<string, string> = {
  x: "✓ αντιπαράδειγμα",
  h: "δεν ισχύει η υπόθεση",
  c: "ισχύει το συμπέρασμα",
  "": "άλλος λόγος",
};

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
      {question.originLabel ? <PracticeOriginBadge label={question.originLabel} /> : null}
      <p className={cn("whitespace-pre-line font-medium", compact ? "text-sm" : "text-base")}>
        <MathText text={question.prompt} />
      </p>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- public bucket URL, any size
        <img src={imageUrl} alt="" className="max-h-48 rounded-md border object-contain" />
      ) : null}

      {question.type === "choice" || question.type === "multi" ? (
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

      {question.type === "counterexample" ? (
        <div className="space-y-2">
          <p className="text-sm">
            Ο ισχυρισμός είναι <strong>{question.answer ? "αληθής" : "ψευδής"}</strong>
          </p>
          {question.options.length ? (
            <ul className="grid gap-1.5">
              {question.options.map((option, index) => (
                <li
                  key={index}
                  className={cn("rounded-md border px-3 py-1.5 text-sm", option.marker === "x" && "border-emerald-500/60 bg-emerald-500/10")}
                >
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <MathText text={option.text} />
                    </span>
                    <span className={cn("shrink-0 text-xs font-semibold", option.marker === "x" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
                      {MARKER_LABEL[option.marker ?? ""]}
                    </span>
                  </div>
                  {option.reason ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <MathText text={option.reason} />
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {question.type === "order" ? (
        <ol className="grid gap-1.5">
          {question.options.map((option, index) => (
            <li key={index} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <span className="w-4 text-xs font-semibold text-muted-foreground">{index + 1}.</span>
              <span className="flex-1"><MathText text={option.text} /></span>
            </li>
          ))}
        </ol>
      ) : null}

      {question.type === "match" ? (
        <ul className="grid gap-1.5">
          {question.options.map((option, index) => (
            <li key={index} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
              <span><MathText text={option.text} /></span>
              <span className="text-muted-foreground" aria-hidden="true">→</span>
              <span><MathText text={option.match ?? ""} /></span>
            </li>
          ))}
        </ul>
      ) : null}

      {question.type === "sign_table" && question.signs ? (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <tbody>
              <tr className="border-b">
                <th className="border-r px-2 py-1 font-semibold"><MathText text="$x$" /></th>
                <td className="px-2 py-1"><MathText text="$-\infty$" /></td>
                {question.options.map((root, index) => (
                  <td key={index} colSpan={2} className="px-2 py-1 text-right font-medium"><MathText text={mathOf(root.text)} /></td>
                ))}
                <td className="px-2 py-1 text-right"><MathText text="$+\infty$" /></td>
              </tr>
              <tr>
                <th className="border-r px-2 py-1 font-semibold">
                  {question.signLabel ? <MathText text={mathOf(question.signLabel)} /> : "πρόσημο"}
                </th>
                {question.signs.map((sign, index) => (
                  <td key={index} colSpan={2} className="px-2 py-1 text-center text-base font-bold">
                    {sign > 0 ? "+" : "−"}
                    {index < question.options.length ? <span className="float-right font-normal text-muted-foreground">0</span> : null}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {question.type === "interval" && question.interval ? (
        <p className="text-sm">
          Απάντηση: <MathText text={formatInterval(question.interval)} />
          {question.tolerance ? <span className="text-muted-foreground"> (±{fmt(question.tolerance)})</span> : null}
        </p>
      ) : null}

      {question.type === "expression" && question.expression ? (
        <p className="text-sm">
          Απάντηση: <MathText text={texOf(question.expression)} />
          <span className="text-muted-foreground"> (κάθε ισοδύναμη μορφή)</span>
        </p>
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
