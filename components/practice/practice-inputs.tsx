"use client";

// The game's inputs for the newer question types (tick all that apply,
// ordering, matching, sign table, interval, expression), and the button
// styles the game shares with them. Each input checks on the device and
// reports right/wrong through onSubmit; after that it shows the answer.

import * as React from "react";

import { MathText } from "@/components/math-text";
import { exprToTex } from "@/lib/practice-expr";
import {
  checkExpression,
  checkInterval,
  checkMatch,
  checkMulti,
  checkOrder,
  checkSigns,
  formatInterval,
  parseTypedExpression,
  parseTypedValue,
  type PlayableQuestion,
  type PracticeInterval,
} from "@/lib/practice-template";
import { cn } from "@/lib/utils";

// The game's buttons press down (the "game" feel from the prototype).
export const PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-3.5 text-base font-bold text-brand-foreground shadow-[0_4px_0_0_hsl(var(--brand)/0.45)] transition active:translate-y-1 active:shadow-none disabled:cursor-not-allowed disabled:opacity-45 disabled:active:translate-y-0";
export const SECONDARY =
  "inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-border bg-card px-4 py-3 text-sm font-semibold transition hover:border-brand/60 active:translate-y-0.5";
export const CHOICE =
  "flex w-full items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3.5 text-left text-base font-medium shadow-[0_4px_0_0_hsl(var(--border))] transition enabled:hover:border-brand/70 enabled:active:translate-y-1 enabled:active:shadow-none disabled:cursor-default";
const RIGHT = "border-emerald-500 bg-emerald-500/10";
const WRONG = "animate-[practice-shake_.35s_ease-out] border-red-500 bg-red-500/10";
/** Small keys that type into an answer box. */
const KEY =
  "min-w-10 rounded-xl border-2 border-border bg-card px-2.5 py-1.5 text-base font-semibold shadow-[0_2px_0_0_hsl(var(--border))] transition active:translate-y-0.5 active:shadow-none disabled:opacity-45";

export interface InputProps {
  question: PlayableQuestion;
  /** null until answered, then whether it was right. */
  result: boolean | null;
  onSubmit: (correct: boolean) => void;
}

/** A shuffle that isn't the identity (when there's more than one item). */
export function shuffledIndexes(count: number, rng: () => number = Math.random): number[] {
  const indexes = Array.from({ length: count }, (_, i) => i);
  for (let attempt = 0; attempt < 10; attempt++) {
    for (let i = count - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [indexes[i], indexes[j]] = [indexes[j], indexes[i]];
    }
    if (count < 2 || indexes.some((index, i) => index !== i)) break;
  }
  return indexes;
}

function CheckButton({ disabled, onClick, label = "Έλεγχος" }: { disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" className={cn(PRIMARY, "w-full")} disabled={disabled} onClick={onClick}>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------- multi

export function MultiInput({ question, result, onSubmit }: InputProps) {
  const [ticked, setTicked] = React.useState<Set<number>>(new Set());
  const answered = result !== null;
  const toggle = (i: number) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <div className="grid gap-2.5">
      <p className="text-sm font-semibold text-muted-foreground">Διάλεξε όλα όσα ισχύουν.</p>
      {question.options.map((option, i) => {
        const on = ticked.has(i);
        const state = !answered ? (on ? "on" : "") : option.correct ? (on ? "right" : "missed") : on ? "wrong" : "dim";
        return (
          <button
            key={i}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={answered}
            onClick={() => toggle(i)}
            className={cn(
              CHOICE,
              state === "on" && "border-brand bg-brand/10",
              state === "right" && RIGHT,
              state === "missed" && "border-dashed border-emerald-500",
              state === "wrong" && WRONG,
              state === "dim" && "opacity-50",
            )}
          >
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-lg border-2 text-sm font-bold",
                on ? "border-brand bg-brand text-brand-foreground" : "border-border text-transparent",
              )}
              aria-hidden
            >
              ✓
            </span>
            <span className="min-w-0 flex-1"><MathText text={option.text} /></span>
            {state === "missed" ? <span className="shrink-0 text-xs font-bold text-emerald-700 dark:text-emerald-300">κι αυτό</span> : null}
          </button>
        );
      })}
      {!answered ? <CheckButton disabled={ticked.size === 0} onClick={() => onSubmit(checkMulti(question, [...ticked]))} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- order

export function OrderInput({ question, result, onSubmit }: InputProps) {
  const [pool] = React.useState(() => shuffledIndexes(question.options.length));
  const [placed, setPlaced] = React.useState<number[]>([]);
  const answered = result !== null;
  const remaining = pool.filter((index) => !placed.includes(index));
  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <p className="text-sm font-semibold text-muted-foreground">
          {answered ? "Η σειρά σου" : "Πάτα τα με τη σωστή σειρά (πάτα ξανά για να το βγάλεις)."}
        </p>
        <ol className="grid gap-2">
          {question.options.map((_, position) => {
            const index = placed[position];
            const filled = index !== undefined;
            const right = answered && filled && question.options[index].text === question.options[position].text;
            return (
              <li key={position}>
                <button
                  type="button"
                  disabled={answered || !filled}
                  onClick={() => setPlaced((prev) => prev.filter((_, i) => i !== position))}
                  className={cn(
                    CHOICE,
                    "min-h-14",
                    !filled && "border-dashed shadow-none",
                    answered && (right ? RIGHT : WRONG),
                  )}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg border-2 border-border text-xs font-bold text-muted-foreground">
                    {position + 1}
                  </span>
                  <span className="min-w-0 flex-1">{filled ? <MathText text={question.options[index].text} /> : null}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      {!answered && remaining.length ? (
        <div className="flex flex-wrap gap-2" aria-label="Για να τα βάλεις στη σειρά">
          {remaining.map((index) => (
            <button
              key={index}
              type="button"
              data-index={index}
              onClick={() => setPlaced((prev) => [...prev, index])}
              className={cn(CHOICE, "w-auto py-2.5")}
            >
              <MathText text={question.options[index].text} />
            </button>
          ))}
        </div>
      ) : null}
      {!answered ? (
        <CheckButton disabled={remaining.length > 0} onClick={() => onSubmit(checkOrder(question, placed))} />
      ) : null}
      {answered && !result ? (
        <div className="grid gap-1 text-sm">
          <p className="font-semibold">Η σωστή σειρά:</p>
          <ol className="list-inside list-decimal">
            {question.options.map((option, i) => (
              <li key={i}><MathText text={option.text} /></li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- match

export function MatchInput({ question, result, onSubmit }: InputProps) {
  const [rights] = React.useState(() => shuffledIndexes(question.options.length));
  const [pairs, setPairs] = React.useState<(number | null)[]>(() => question.options.map(() => null));
  const [active, setActive] = React.useState(0);
  const answered = result !== null;
  const unused = rights.filter((index) => !pairs.includes(index));

  const assign = (right: number) => {
    const target = pairs[active] === null ? active : pairs.findIndex((pair) => pair === null);
    if (target < 0) return;
    const next = pairs.map((pair, i) => (i === target ? right : pair));
    setPairs(next);
    const empty = next.findIndex((pair) => pair === null);
    if (empty >= 0) setActive(empty);
  };

  return (
    <div className="grid gap-4">
      <p className="text-sm font-semibold text-muted-foreground">
        {answered ? "Τα ζευγάρια σου" : "Διάλεξε μια γραμμή και μετά αυτό που της αντιστοιχεί."}
      </p>
      <div className="grid gap-2">
        {question.options.map((option, i) => {
          const pair = pairs[i];
          const right = answered && pair !== null && question.options[pair].match === option.match;
          return (
            <div
              key={i}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-2xl border-2 bg-card px-3 py-2.5",
                !answered && active === i ? "border-brand" : "border-border",
                answered && (right ? RIGHT : WRONG),
              )}
            >
              <button type="button" disabled={answered} onClick={() => setActive(i)} className="min-w-0 text-left font-medium">
                <MathText text={option.text} />
              </button>
              <span className="text-muted-foreground" aria-hidden>→</span>
              <button
                type="button"
                disabled={answered}
                onClick={() => {
                  if (pair !== null) setPairs((prev) => prev.map((value, j) => (j === i ? null : value)));
                  setActive(i);
                }}
                aria-label={pair === null ? "Κενό" : "Βγάλ' το"}
                className={cn("min-h-9 min-w-0 rounded-xl px-2 py-1 text-left", pair === null && "border-2 border-dashed border-border")}
              >
                {pair !== null ? <MathText text={question.options[pair].match ?? ""} /> : null}
              </button>
              {answered && !right ? (
                <p className="col-span-3 text-sm text-muted-foreground">
                  Σωστό: <MathText text={option.match ?? ""} />
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
      {!answered && unused.length ? (
        <div className="flex flex-wrap gap-2">
          {unused.map((index) => (
            <button key={index} type="button" data-index={index} onClick={() => assign(index)} className={cn(CHOICE, "w-auto py-2.5")}>
              <MathText text={question.options[index].match ?? ""} />
            </button>
          ))}
        </div>
      ) : null}
      {!answered ? <CheckButton disabled={unused.length > 0} onClick={() => onSubmit(checkMatch(question, pairs))} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- sign table

const mathOf = (text: string) => (text.includes("$") ? text : `$${text}$`);

export function SignTableInput({ question, result, onSubmit }: InputProps) {
  const answer = question.signs ?? [];
  const roots = question.options;
  const [signs, setSigns] = React.useState<(number | null)[]>(() => answer.map(() => null));
  const answered = result !== null;
  const cycle = (i: number) => setSigns((prev) => prev.map((sign, j) => (j === i ? (sign === 1 ? -1 : 1) : sign)));
  // label | -∞ | cell | root | cell | ... | cell | +∞
  const columns = ["auto", "auto", ...answer.flatMap((_, i) => (i < roots.length ? ["minmax(2.5rem,1fr)", "auto"] : ["minmax(2.5rem,1fr)"])), "auto"].join(" ");
  const cell = "flex items-center justify-center px-1 py-2";
  return (
    <div className="grid gap-4">
      <p className="text-sm font-semibold text-muted-foreground">Πάτα σε κάθε διάστημα για να βάλεις + ή −.</p>
      <div className="overflow-x-auto rounded-2xl border-2 border-border bg-card">
        <div className="grid min-w-fit items-stretch text-base" style={{ gridTemplateColumns: columns }}>
          <div className={cn(cell, "border-b-2 border-r-2 border-border px-3 font-semibold")}><MathText text="$x$" /></div>
          <div className={cn(cell, "border-b-2 border-border text-sm")}><MathText text="$-\infty$" /></div>
          {answer.map((_, i) => (
            <React.Fragment key={i}>
              <div className="border-b-2 border-border" />
              {i < roots.length ? <div className={cn(cell, "border-b-2 border-border font-semibold")}><MathText text={mathOf(roots[i].text)} /></div> : null}
            </React.Fragment>
          ))}
          <div className={cn(cell, "border-b-2 border-border text-sm")}><MathText text="$+\infty$" /></div>

          <div className={cn(cell, "border-r-2 border-border px-3 font-semibold")}>{question.signLabel ? <MathText text={mathOf(question.signLabel)} /> : "πρόσημο"}</div>
          <div />
          {answer.map((correct, i) => {
            const sign = signs[i];
            const state = !answered ? "" : sign === correct ? "right" : "wrong";
            return (
              <React.Fragment key={i}>
                <div className={cn(cell, "p-1.5")}>
                  <button
                    type="button"
                    disabled={answered}
                    onClick={() => cycle(i)}
                    aria-label={`Διάστημα ${i + 1}: ${sign === null ? "κενό" : sign > 0 ? "θετικό" : "αρνητικό"}`}
                    className={cn(
                      "grid h-11 w-full min-w-10 place-items-center rounded-xl border-2 text-2xl font-extrabold transition enabled:active:translate-y-0.5",
                      sign === null ? "border-dashed border-border text-muted-foreground" : "border-brand bg-brand/10",
                      state === "right" && RIGHT,
                      state === "wrong" && WRONG,
                    )}
                  >
                    {sign === null ? "?" : sign > 0 ? "+" : "−"}
                  </button>
                </div>
                {i < roots.length ? <div className={cn(cell, "font-semibold text-muted-foreground")}>0</div> : null}
              </React.Fragment>
            );
          })}
          <div />
        </div>
      </div>
      {!answered ? <CheckButton disabled={signs.some((sign) => sign === null)} onClick={() => onSubmit(checkSigns(question, signs))} /> : null}
      {answered && !result ? (
        <p className="text-sm">
          <span className="font-semibold">Σωστά πρόσημα:</span> {answer.map((sign) => (sign > 0 ? "+" : "−")).join("  ")}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- interval

const INF_TYPED = /^[+-]?\s*(∞|inf)$/i;

/** One endpoint as typed: a value, ±∞ (null), or undefined when it can't be read. */
function readEnd(text: string, side: "lo" | "hi"): number | null | undefined {
  const clean = text.trim().replace(/[−–]/g, "-");
  if (INF_TYPED.test(clean)) {
    const negative = clean.startsWith("-");
    return negative === (side === "lo") ? null : undefined;
  }
  const value = parseTypedValue(clean);
  return value === null ? undefined : value;
}

export function IntervalInput({ question, result, onSubmit }: InputProps) {
  const [lo, setLo] = React.useState("");
  const [hi, setHi] = React.useState("");
  const [loClosed, setLoClosed] = React.useState(true);
  const [hiClosed, setHiClosed] = React.useState(true);
  const answered = result !== null;
  const loValue = readEnd(lo, "lo");
  const hiValue = readEnd(hi, "hi");
  const ready = loValue !== undefined && hiValue !== undefined && (loValue === null || hiValue === null || hiValue > loValue);
  const given: PracticeInterval | null = ready
    ? { lo: loValue, hi: hiValue, loClosed: loValue !== null && loClosed, hiClosed: hiValue !== null && hiClosed }
    : null;

  const bracket = (closed: boolean, side: "lo" | "hi", infinite: boolean, toggle: () => void) => (
    <button
      type="button"
      disabled={answered || infinite}
      onClick={toggle}
      aria-label={side === "lo" ? "Αριστερή αγκύλη" : "Δεξιά αγκύλη"}
      className={cn(KEY, "h-14 w-11 px-0 text-3xl font-bold")}
    >
      {side === "lo" ? (closed && !infinite ? "[" : "(") : closed && !infinite ? "]" : ")"}
    </button>
  );
  const end = (value: string, set: (text: string) => void, side: "lo" | "hi") => (
    <div className="grid min-w-0 flex-1 gap-1.5">
      <input
        value={value}
        disabled={answered}
        onChange={(event) => set(event.target.value)}
        autoComplete="off"
        aria-label={side === "lo" ? "Αριστερό άκρο" : "Δεξί άκρο"}
        placeholder={side === "lo" ? "από" : "έως"}
        className={cn(
          "h-14 w-full min-w-0 rounded-2xl border-2 bg-card px-3 text-center text-xl font-bold tabular-nums outline-none focus:border-brand",
          value && readEnd(value, side) === undefined && "border-destructive",
        )}
      />
      <button type="button" disabled={answered} className={cn(KEY, "text-sm")} onClick={() => set(side === "lo" ? "-∞" : "+∞")}>
        {side === "lo" ? "−∞" : "+∞"}
      </button>
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-2">
        {bracket(loClosed, "lo", loValue === null, () => setLoClosed((v) => !v))}
        {end(lo, setLo, "lo")}
        <span className="pt-4 text-2xl font-bold">,</span>
        {end(hi, setHi, "hi")}
        {bracket(hiClosed, "hi", hiValue === null, () => setHiClosed((v) => !v))}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        Πάτα την αγκύλη για κλειστό [ ή ανοιχτό ( άκρο. Γράφεται και 3/4, √2, π.
      </p>
      <p className={cn("text-center text-2xl font-bold", answered && (result ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"))}>
        {given ? <MathText text={formatInterval(given)} /> : <span className="text-base font-normal text-muted-foreground">Συμπλήρωσε και τα δύο άκρα</span>}
      </p>
      {!answered ? <CheckButton disabled={!given} onClick={() => given && onSubmit(checkInterval(question, given))} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------- expression

const EXPRESSION_KEYS: { label: string; insert: string }[] = [
  { label: "x", insert: "x" },
  { label: "x²", insert: "^2" },
  { label: "^", insert: "^" },
  { label: "√", insert: "√(" },
  { label: "/", insert: "/" },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "π", insert: "π" },
  { label: "e", insert: "e" },
  { label: "ln", insert: "ln(" },
];

/** Inserts text at the cursor of an input, keeping React's value in step. */
export function useInsert(value: string, set: (text: string) => void) {
  const ref = React.useRef<HTMLInputElement>(null);
  const insert = (text: string) => {
    const input = ref.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? value.length;
    set(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + text.length, start + text.length);
    });
  };
  return { ref, insert };
}

export function ExpressionInput({ question, result, onSubmit }: InputProps) {
  const [typed, setTyped] = React.useState("");
  const { ref, insert } = useInsert(typed, setTyped);
  const answered = result !== null;
  const parsed = parseTypedExpression(typed);
  let preview: string | null = null;
  try {
    preview = parsed ? exprToTex(parsed) : null;
  } catch {
    preview = null;
  }
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed) onSubmit(checkExpression(question, typed));
      }}
    >
      <input
        ref={ref}
        value={typed}
        disabled={answered}
        onChange={(event) => setTyped(event.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        autoFocus
        aria-label="Η παράστασή σου"
        placeholder="π.χ. 3x^2 + 2"
        className={cn(
          "h-14 w-full rounded-2xl border-2 bg-card px-4 text-xl font-bold outline-none focus:border-brand",
          answered && (result ? "border-emerald-500" : "border-red-500"),
        )}
      />
      {!answered ? (
        <div className="flex flex-wrap gap-1.5">
          {EXPRESSION_KEYS.map((key) => (
            <button key={key.label} type="button" className={KEY} onClick={() => insert(key.insert)}>
              {key.label}
            </button>
          ))}
        </div>
      ) : null}
      <p className="min-h-8 text-center text-xl">
        {preview ? (
          <MathText text={`$${preview}$`} />
        ) : typed.trim() ? (
          <span className="text-sm text-muted-foreground">Δεν το διαβάζω ακόμα - έλεγξε τις παρενθέσεις. Γράψε sin(x), όχι sinx.</span>
        ) : (
          <span className="text-sm text-muted-foreground">Εδώ θα δεις τι διαβάζω.</span>
        )}
      </p>
      {!answered ? (
        <button type="submit" className={cn(PRIMARY, "w-full")} disabled={!parsed}>
          Έλεγχος
        </button>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------- typed counterexample (v3a)

const COUNTEREXAMPLE_KEYS: { label: string; insert: string }[] = [
  { label: "x", insert: "x" },
  { label: "x²", insert: "^2" },
  { label: "xⁿ", insert: "^" },
  { label: "√", insert: "√(" },
  { label: "|x|", insert: "|x|" },
  { label: "eˣ", insert: "e^(" },
  { label: "ln", insert: "ln(" },
  { label: "ημ", insert: "sin(" },
  { label: "/", insert: "/" },
  { label: "(", insert: "(" },
  { label: ")", insert: ")" },
  { label: "π", insert: "π" },
];

/**
 * Step 2 typed: "f(x) =" (and "x₀ =" when the question has a point), with
 * keys for what a phone keyboard lacks and a preview of what was read.
 * `onCheck` gets the typed text; `onShowOptions` is the way out.
 */
export function TypedCounterexampleInput({
  needsPoint,
  disabled,
  onCheck,
  onShowOptions,
}: {
  needsPoint: boolean;
  disabled: boolean;
  onCheck: (typed: string, x0: string | null) => void;
  onShowOptions: () => void;
}) {
  const [typed, setTyped] = React.useState("");
  const [point, setPoint] = React.useState("");
  const { ref, insert } = useInsert(typed, setTyped);
  const parsed = parseTypedExpression(typed);
  const pointValue = needsPoint ? parseTypedValue(point) : null;
  let preview: string | null = null;
  try {
    preview = parsed ? exprToTex(parsed) : null;
  } catch {
    preview = null;
  }
  const ready = Boolean(parsed) && (!needsPoint || pointValue !== null);
  const shown = preview ? `$f(x) = ${preview}$` + (needsPoint && pointValue !== null ? `, στο $x_0 = ${point.trim()}$` : "") : null;
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onCheck(typed, needsPoint ? point : null);
      }}
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-lg font-bold"><MathText text="$f(x) =$" /></span>
        <input
          ref={ref}
          value={typed}
          disabled={disabled}
          onChange={(event) => setTyped(event.target.value)}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus
          aria-label="Το αντιπαράδειγμά σου"
          placeholder="π.χ. |x|"
          className="h-14 w-0 min-w-0 flex-1 rounded-2xl border-2 bg-card px-4 text-xl font-bold outline-none focus:border-brand"
        />
      </div>
      {needsPoint ? (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-lg font-bold"><MathText text="$x_0 =$" /></span>
          <input
            value={point}
            disabled={disabled}
            onChange={(event) => setPoint(event.target.value)}
            autoComplete="off"
            inputMode="decimal"
            aria-label="Το σημείο x0"
            placeholder="π.χ. 0"
            className={cn(
              "h-12 w-28 rounded-2xl border-2 bg-card px-3 text-center text-xl font-bold tabular-nums outline-none focus:border-brand",
              point && pointValue === null && "border-destructive",
            )}
          />
        </div>
      ) : null}
      {!disabled ? (
        <div className="flex flex-wrap gap-1.5" aria-label="Σύμβολα">
          {COUNTEREXAMPLE_KEYS.map((key) => (
            <button key={key.label} type="button" className={KEY} onClick={() => insert(key.insert)}>
              {key.label}
            </button>
          ))}
        </div>
      ) : null}
      <p className="min-h-8 text-center text-xl">
        {shown ? (
          <MathText text={shown} />
        ) : typed.trim() ? (
          <span className="text-sm text-muted-foreground">Δεν το διαβάζω ακόμα - έλεγξε τις παρενθέσεις. Γράψε sin(x), όχι sinx.</span>
        ) : (
          <span className="text-sm text-muted-foreground">Εδώ θα δεις τι διαβάζω.</span>
        )}
      </p>
      {!disabled ? (
        <>
          <button type="submit" className={cn(PRIMARY, "w-full")} disabled={!ready}>
            Έλεγχος
          </button>
          <button type="button" className="self-center text-sm text-muted-foreground underline underline-offset-2" onClick={onShowOptions}>
            Δείξε μου επιλογές (λιγότεροι πόντοι)
          </button>
        </>
      ) : null}
    </form>
  );
}

/** The right answer as text for the feedback panel (interval, expression), or null. */
export function newTypeCorrectText(question: PlayableQuestion): string | null {
  if (question.type === "interval" && question.interval) return formatInterval(question.interval);
  if (question.type === "expression" && question.expression) {
    try {
      return `$${exprToTex(question.expression)}$`;
    } catch {
      return null;
    }
  }
  return null;
}
