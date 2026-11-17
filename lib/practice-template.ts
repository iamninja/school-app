// Practice questions as templates: random numbers per draw, and the one
// shape (PlayableQuestion) every question becomes before it is played -
// with or without variables. Pure; tests in tests/practice-template.test.ts.
//
// Variables (comma-separated, in order; later ones may use earlier ones):
//   a=2..9            whole numbers 2 to 9
//   p=0.5..3 step 0.5 0.5, 1, 1.5, ... 3
//   b=-9..9 !0        exclude values (several: !0 !1)
//   s=-1|1            pick one of a list
//   c=a*x+b           computed
// Condition: any expression every draw must satisfy ("a != b and c > 0").
//
// Placeholders in the question, options, answer and explanation:
//   {{a}}     the value          {{a*x+b}}  any expression
//   {{+b}}    with its sign, for "x {{+b}}" -> "x + 3" / "x − 3"
// Inside $...$ a decimal is written 7{,}5 (LaTeX), outside 7,5.

import { evalExpr, exprVariables, normalizeTyped, PracticeExprError } from "@/lib/practice-expr";
import { readCounterexampleOption, type TypedOption } from "@/lib/practice-latex";
import { figureProblems } from "@/lib/practice-tikz";

export type PracticeQuestionType =
  | "choice"
  | "true_false"
  | "number"
  | "slider"
  | "point"
  | "counterexample"
  | "multi"
  | "interval"
  | "order"
  | "match"
  | "sign_table"
  | "expression";

export const PRACTICE_QUESTION_TYPES: PracticeQuestionType[] = [
  "choice", "true_false", "number", "slider", "point", "counterexample", "multi", "interval", "order", "match", "sign_table", "expression",
];

/**
 * A counterexample question's option: "x" the counterexample, "h" the
 * claim's hypothesis fails for it, "c" its conclusion still holds, ""
 * wrong for another reason. Each says why in its reason.
 */
export type CounterexampleMarker = "x" | "h" | "c" | "";
export const COUNTEREXAMPLE_MARKERS: CounterexampleMarker[] = ["x", "h", "c", ""];

export interface PracticeOption {
  text: string;
  correct: boolean;
  /** Counterexample questions only. */
  marker?: CounterexampleMarker;
  reason?: string | null;
  /** Match questions only: the right-hand item this one pairs with. */
  match?: string;
  /** Counterexample options, when played: the option as a function of x (null when it can't be read). */
  typed?: TypedOption | null;
}

/**
 * How a false counterexample claim is answered at step 2: "auto" (options
 * until the student has got it right once, then typed), or always one way.
 */
export type CounterexampleMode = "auto" | "options" | "typed";
export const COUNTEREXAMPLE_MODES: CounterexampleMode[] = ["auto", "options", "typed"];

/** An interval's endpoints; null is -∞ (lo) or +∞ (hi), always open. */
export interface PracticeInterval {
  lo: number | null;
  hi: number | null;
  loClosed: boolean;
  hiClosed: boolean;
}

/** Where a question comes from, shown to students as a small label. */
export type PracticeOrigin = "panhellenic" | "textbook" | "custom";

export const PRACTICE_ORIGIN_LABELS: Record<Exclude<PracticeOrigin, "custom">, string> = {
  panhellenic: "Πανελλαδικές",
  textbook: "Σχολικό βιβλίο",
};

export const MAX_ORIGIN_DETAIL = 120;

const PLAIN: Record<string, string> = { ά: "α", έ: "ε", ή: "η", ί: "ι", ό: "ο", ύ: "υ", ώ: "ω", ϊ: "ι", ϋ: "υ", ΐ: "ι", ΰ: "υ" };
/** Lowercase without Greek accents, one character for one (so indexes still line up). */
const plain = (text: string) => [...text.toLowerCase()].map((ch) => PLAIN[ch] ?? ch).join("");

const ORIGIN_WORDS: [PracticeOrigin, RegExp][] = [
  ["panhellenic", /^(πανελλαδικες(\s+εξετασεις)?|πανελληνιες(\s+εξετασεις)?|panhellenic(\s+exams?)?)(?![\p{L}])/u],
  ["textbook", /^(σχολικο\s+βιβλιο|βιβλιο|textbook|school\s*book)(?![\p{L}])/u],
];

/**
 * A written source ("Πανελλαδικές 2019 · Θέμα Β", "Σχολικό βιβλίο σελ. 45",
 * "Μαθηματική Εταιρεία") as origin + detail: the two known kinds by their
 * name at the start (accents and case don't matter), anything else custom.
 */
export function parseOriginText(raw: string | null | undefined): { origin: PracticeOrigin | null; originDetail: string | null } {
  const text = (raw ?? "").trim();
  if (!text) return { origin: null, originDetail: null };
  for (const [origin, words] of ORIGIN_WORDS) {
    const match = words.exec(plain(text));
    if (match) {
      const rest = text.slice(match[0].length).replace(/^[\s·:,\-–—]+/, "").trim();
      return { origin, originDetail: rest || null };
    }
  }
  return { origin: "custom", originDetail: text };
}

/**
 * "Πανελλαδικές · 2019 · Θέμα Β", "Σχολικό βιβλίο", or a custom source's
 * name (its detail). null when the question has no source to show.
 */
export function practiceOriginLabel(origin: PracticeOrigin | null | undefined, detail: string | null | undefined): string | null {
  const extra = (detail ?? "").trim();
  if (origin === "custom") return extra || null;
  if (origin === "panhellenic" || origin === "textbook") {
    return extra ? `${PRACTICE_ORIGIN_LABELS[origin]} · ${extra}` : PRACTICE_ORIGIN_LABELS[origin];
  }
  return null;
}

export interface PracticeGraph {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Expressions in x (may use template variables), drawn as curves. */
  plots: string[];
}

/** A question as stored (and as the editor and the importer produce it). */
export interface PracticeQuestionSpec {
  type: PracticeQuestionType;
  prompt: string;
  options?: PracticeOption[] | null;
  answer?: string | null;
  tolerance?: number | null;
  sliderMin?: number | null;
  sliderMax?: number | null;
  sliderStep?: number | null;
  graph?: PracticeGraph | null;
  variables?: string | null;
  condition?: string | null;
  explanation?: string | null;
  /** Where it comes from (optional), and a short detail ("2019 · Θέμα Β"). */
  origin?: PracticeOrigin | null;
  originDetail?: string | null;
  /** Counterexample questions: options, typed, or auto (the default). */
  counterexampleMode?: CounterexampleMode | null;
  /** A figure in TikZ (lib/practice-tikz.ts), with {{a}} placeholders for a template's numbers. */
  figure?: string | null;
}

/** One concrete question, numbers filled in - what a round plays. */
export interface PlayableQuestion {
  type: PracticeQuestionType;
  prompt: string;
  options: PracticeOption[];
  /** true_false: 1/0; number/slider: the value; point: x (and answerY). */
  answer: number;
  answerY: number;
  tolerance: number;
  slider: { min: number; max: number; step: number } | null;
  graph: PracticeGraph | null;
  explanation: string | null;
  /** "Πανελλαδικές · 2019" etc., or null (practiceOriginLabel). */
  originLabel: string | null;
  /** interval: the answer. */
  interval?: PracticeInterval | null;
  /** sign_table: the sign (+1/-1) in each interval, left to right; options are the roots. */
  signs?: number[] | null;
  /** sign_table: what the row is the sign of ("f'(x)"), or null. */
  signLabel?: string | null;
  /** expression: the answer in x, template numbers filled in. */
  expression?: string | null;
  /**
   * Counterexample (false claim): can the counterexample be typed? Only when
   * the [x] option reads as a formula of x; `x0` when it names a point.
   */
  typeable?: { x0: boolean } | null;
  counterexampleMode?: CounterexampleMode;
  /** The figure's TikZ, the template's numbers filled in, or null. */
  figure?: string | null;
}

export type VariableDef =
  | { name: string; kind: "range"; min: number; max: number; step: number; exclude: number[] }
  | { name: string; kind: "list"; values: number[] }
  | { name: string; kind: "expr"; expr: string };

export class PracticeTemplateError extends Error {}

const NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED = new Set(["pi", "e", "and", "or", "not", "sqrt", "abs", "round", "min", "max", "sin", "cos", "tan", "ln", "log", "exp"]);

/** Parses "a=2..9, b=-9..9 !0, c=a*x+b". Throws PracticeTemplateError. */
export function parseVariables(source: string | null | undefined): VariableDef[] {
  const text = (source ?? "").trim();
  if (!text) return [];
  const defs: VariableDef[] = [];
  // Split on commas that aren't inside parentheses (max(a, b) is one value).
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of text) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if ((ch === "," || ch === ";" || ch === "\n") && depth === 0) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;
    const eq = part.indexOf("=");
    if (eq <= 0) throw new PracticeTemplateError(`"${part}": write it as name=values, e.g. a=2..9`);
    const name = part.slice(0, eq).trim();
    let rest = part.slice(eq + 1).trim();
    if (!NAME.test(name) || RESERVED.has(name.toLowerCase())) {
      throw new PracticeTemplateError(`"${name}" can't be a variable name - use letters like a, b, k`);
    }
    if (defs.some((def) => def.name === name)) throw new PracticeTemplateError(`"${name}" is defined twice`);

    const exclude: number[] = [];
    rest = rest.replace(/!\s*(-?\d+(?:\.\d+)?)/g, (_, value: string) => {
      exclude.push(Number(value));
      return "";
    }).trim();

    const range = /^(-?\d+(?:\.\d+)?)\s*\.\.\s*(-?\d+(?:\.\d+)?)(?:\s+step\s+(\d+(?:\.\d+)?))?$/i.exec(rest);
    if (range) {
      const min = Number(range[1]);
      const max = Number(range[2]);
      const step = range[3] ? Number(range[3]) : 1;
      if (max < min) throw new PracticeTemplateError(`${name}: the range ${min}..${max} runs backwards`);
      if (step <= 0) throw new PracticeTemplateError(`${name}: step must be above 0`);
      defs.push({ name, kind: "range", min, max, step, exclude });
      continue;
    }
    if (rest.includes("|")) {
      const values = rest.split("|").map((value) => Number(value.trim()));
      if (values.some((value) => !Number.isFinite(value))) {
        throw new PracticeTemplateError(`${name}: a list takes numbers, like -1|1|2`);
      }
      defs.push({ name, kind: "list", values });
      continue;
    }
    try {
      const used = exprVariables(rest);
      const unknown = used.filter((other) => !defs.some((def) => def.name === other));
      if (unknown.length) {
        throw new PracticeTemplateError(`${name}: "${unknown[0]}" isn't defined before it`);
      }
    } catch (error) {
      if (error instanceof PracticeTemplateError) throw error;
      throw new PracticeTemplateError(`${name}: ${(error as Error).message}`);
    }
    defs.push({ name, kind: "expr", expr: rest });
  }
  return defs;
}

/** A source of randomness in [0, 1) - Math.random, or seeded in tests. */
export type Rng = () => number;

/** A small seeded generator (mulberry32), for tests and stable previews. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], rng: Rng): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
}

/**
 * One set of values meeting the condition. Tries up to `attempts` draws,
 * then throws - a condition nothing satisfies is a mistake in the template.
 */
export function drawValues(
  defs: VariableDef[],
  condition: string | null | undefined,
  rng: Rng = Math.random,
  attempts = 500,
): Record<string, number> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const scope: Record<string, number> = {};
    let ok = true;
    for (const def of defs) {
      if (def.kind === "range") {
        const count = Math.floor((def.max - def.min) / def.step + 1e-9) + 1;
        const values: number[] = [];
        for (let i = 0; i < count; i++) {
          const value = Math.round((def.min + i * def.step) * 1e9) / 1e9;
          if (!def.exclude.some((excluded) => Math.abs(excluded - value) < 1e-9)) values.push(value);
        }
        if (values.length === 0) throw new PracticeTemplateError(`${def.name}: every value is excluded`);
        scope[def.name] = pick(values, rng);
      } else if (def.kind === "list") {
        scope[def.name] = pick(def.values, rng);
      } else {
        const value = evalExpr(def.expr, scope);
        if (!Number.isFinite(value)) {
          ok = false;
          break;
        }
        scope[def.name] = Math.round(value * 1e9) / 1e9;
      }
    }
    if (!ok) continue;
    if (condition && condition.trim() && !evalExpr(condition, scope)) continue;
    return scope;
  }
  throw new PracticeTemplateError(
    condition ? "No numbers met the condition - check it and the ranges" : "The variables never give a usable value",
  );
}

/** "7.5" -> "7,5" (or "7{,}5" in LaTeX); at most 4 decimals; real minus sign outside math. */
export function formatNumber(value: number, inMath: boolean): string {
  const rounded = Math.round(value * 1e4) / 1e4;
  const clean = Object.is(rounded, -0) ? 0 : rounded;
  const text = String(clean);
  const [whole, decimals] = text.split(".");
  const body = decimals ? `${whole}${inMath ? "{,}" : ","}${decimals}` : whole;
  return !inMath && body.startsWith("-") ? `−${body.slice(1)}` : body;
}

/**
 * Replaces {{expr}} and {{+expr}} using the values. Knows whether each
 * placeholder sits inside $...$ (math) to write decimals the LaTeX way.
 */
export function fillPlaceholders(text: string, scope: Record<string, number>): string {
  let out = "";
  let inMath = false;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\" && text[i + 1] === "$") {
      out += "\\$";
      i += 2;
      continue;
    }
    if (text[i] === "$") {
      inMath = !inMath;
      out += "$";
      i++;
      continue;
    }
    if (text.startsWith("{{", i)) {
      const end = text.indexOf("}}", i + 2);
      if (end === -1) throw new PracticeTemplateError('A "{{" has no closing "}}"');
      let expr = text.slice(i + 2, end).trim();
      const signed = expr.startsWith("+");
      if (signed) expr = expr.slice(1).trim();
      const value = evalExpr(expr, scope);
      if (!Number.isFinite(value)) throw new PracticeTemplateError(`{{${expr}}} has no value for these numbers`);
      if (signed) {
        const sign = value < 0 ? (inMath ? "-" : "−") : "+";
        out += `${sign} ${formatNumber(Math.abs(value), inMath)}`;
      } else {
        out += formatNumber(value, inMath);
      }
      i = end + 2;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

/**
 * Fills {{expr}} in a TikZ figure: plain numbers in coordinates ("2.5",
 * "-3", and "+3" for {{+b}}), and the Greek way inside $...$ labels.
 */
export function fillFigure(text: string, scope: Record<string, number>): string {
  let out = "";
  let inMath = false;
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\\" && text[i + 1] === "$") {
      out += "\\$";
      i += 2;
      continue;
    }
    if (text[i] === "$") {
      inMath = !inMath;
      out += "$";
      i++;
      continue;
    }
    if (text.startsWith("{{", i)) {
      const end = text.indexOf("}}", i + 2);
      if (end === -1) throw new PracticeTemplateError('A "{{" in the figure has no closing "}}"');
      let expr = text.slice(i + 2, end).trim();
      const signed = expr.startsWith("+");
      if (signed) expr = expr.slice(1).trim();
      const value = evalExpr(expr, scope);
      if (!Number.isFinite(value)) throw new PracticeTemplateError(`{{${expr}}} in the figure has no value for these numbers`);
      if (inMath) {
        out += signed ? `${value < 0 ? "-" : "+"} ${formatNumber(Math.abs(value), true)}` : formatNumber(value, true);
      } else {
        const plainNumber = String(Math.round(value * 1e6) / 1e6);
        out += signed && value >= 0 ? `+${plainNumber}` : plainNumber;
      }
      i = end + 2;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

/** "(2, 1)" / "2, 1" -> two expressions. */
export function splitPoint(answer: string): [string, string] | null {
  const inner = answer.trim().replace(/^\(/, "").replace(/\)$/, "");
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if ((ch === "," || ch === ";") && depth === 0) {
      return [inner.slice(0, i).trim(), inner.slice(i + 1).trim()];
    }
  }
  return null;
}

function numberAnswer(answer: string | null | undefined, scope: Record<string, number>, label: string): number {
  if (!answer || !answer.trim()) throw new PracticeTemplateError(`${label} needs an answer`);
  let source = answer.trim().replace(/^\{\{(.*)\}\}$/, "$1").trim();
  // A plain Greek decimal ("7,07") - but never inside max(1, 2).
  if (/^-?\d+,\d+$/.test(source)) source = source.replace(",", ".");
  let value: number;
  try {
    value = evalExpr(source, scope);
  } catch (error) {
    throw new PracticeTemplateError(`Answer "${answer}": ${(error as Error).message}`);
  }
  if (!Number.isFinite(value)) throw new PracticeTemplateError(`Answer "${answer}" has no value for these numbers`);
  return Math.round(value * 1e9) / 1e9;
}

/**
 * Turns a stored question into a concrete one: draws the numbers, fills
 * every placeholder, works out the answer. Throws PracticeTemplateError
 * (or PracticeExprError) when the question can't be played as written.
 */
/**
 * A true/false answer as written - "Σωστό"/"Λάθος", "Αληθής"/"Ψευδής", "true"/"false", "Σ"/"Λ",
 * any case, with or without accents - or null when it's neither. Stored
 * as "true"/"false" (lib/practice-bank.ts).
 */
export function trueFalseValue(raw: string | null | undefined): boolean | null {
  const text = plain((raw ?? "").trim());
  if (["true", "σωστο", "σ", "αληθης", "α"].includes(text)) return true;
  if (["false", "λαθος", "λ", "ψευδης", "ψ"].includes(text)) return false;
  return null;
}

export function instantiate(spec: PracticeQuestionSpec, rng: Rng = Math.random): PlayableQuestion {
  const defs = parseVariables(spec.variables);
  const scope = defs.length || spec.condition ? drawValues(defs, spec.condition, rng) : {};
  const fill = (text: string) => fillPlaceholders(text, scope);

  const base = {
    type: spec.type,
    prompt: fill(spec.prompt),
    explanation: spec.explanation ? fill(spec.explanation) : null,
    figure: spec.figure && spec.figure.trim() ? fillFigure(spec.figure, scope) : null,
    originLabel: practiceOriginLabel(spec.origin, spec.originDetail),
    options: [] as PracticeOption[],
    answer: 0,
    answerY: 0,
    tolerance: Math.max(0, spec.tolerance ?? 0),
    slider: null as PlayableQuestion["slider"],
    graph: null as PracticeGraph | null,
  };

  switch (spec.type) {
    case "choice": {
      const options = (spec.options ?? []).map((option) => ({ text: fill(option.text), correct: option.correct }));
      if (options.length < 2) throw new PracticeTemplateError("A multiple-choice question needs at least 2 options");
      if (options.filter((option) => option.correct).length !== 1) {
        throw new PracticeTemplateError("Mark exactly one option as correct");
      }
      const texts = options.map((option) => option.text.replace(/\s+/g, ""));
      if (new Set(texts).size !== texts.length) {
        throw new PracticeTemplateError("Two options came out the same for these numbers");
      }
      return { ...base, options };
    }
    case "counterexample": {
      const value = trueFalseValue(spec.answer);
      if (value === null) throw new PracticeTemplateError("A counterexample question's answer is Σωστό (the claim is true) or Λάθος");
      const given = spec.options ?? [];
      if (value) {
        if (given.length) throw new PracticeTemplateError("A true claim has no counterexamples - leave out the options");
        return { ...base, answer: 1, counterexampleMode: spec.counterexampleMode ?? "auto" };
      }
      const options: PracticeOption[] = given.map((option) => {
        const marker: CounterexampleMarker = option.marker ?? (option.correct ? "x" : "");
        const text = fill(option.text);
        return { text, correct: marker === "x", marker, reason: option.reason ? fill(option.reason) : null, typed: readCounterexampleOption(text) };
      });
      if (options.length < 2 || options.length > 6) throw new PracticeTemplateError("A false claim needs 2 to 6 options to pick the counterexample from");
      if (options.filter((option) => option.marker === "x").length !== 1) {
        throw new PracticeTemplateError("Mark exactly one option as the counterexample [x]");
      }
      if (options.some((option) => !COUNTEREXAMPLE_MARKERS.includes(option.marker as CounterexampleMarker))) {
        throw new PracticeTemplateError("Options are marked [x], [h], [c] or [ ]");
      }
      const typedAnswer = options.find((option) => option.marker === "x")?.typed;
      return {
        ...base,
        answer: 0,
        options,
        typeable: typedAnswer ? { x0: typedAnswer.x0 !== null } : null,
        counterexampleMode: spec.counterexampleMode ?? "auto",
      };
    }
    case "multi": {
      const options = (spec.options ?? []).map((option) => ({ text: fill(option.text), correct: Boolean(option.correct) }));
      if (options.length < 2 || options.length > 8) throw new PracticeTemplateError("A tick-all-that-apply question needs 2 to 8 options");
      if (!options.some((option) => option.correct)) throw new PracticeTemplateError("Mark at least one option as correct");
      distinctTexts(options.map((option) => option.text));
      return { ...base, options };
    }
    case "order": {
      const options = (spec.options ?? []).map((option) => ({ text: fill(option.text), correct: false }));
      if (options.length < 2 || options.length > 8) throw new PracticeTemplateError("An ordering question needs 2 to 8 items");
      distinctTexts(options.map((option) => option.text));
      return { ...base, options };
    }
    case "match": {
      const options = (spec.options ?? []).map((option) => ({ text: fill(option.text), correct: false, match: fill(option.match ?? "") }));
      if (options.length < 2 || options.length > 6) throw new PracticeTemplateError("A matching question needs 2 to 6 pairs");
      if (options.some((option) => !option.text.trim() || !option.match.trim())) throw new PracticeTemplateError("Every pair needs both sides");
      distinctTexts(options.map((option) => option.text));
      distinctTexts(options.map((option) => option.match));
      return { ...base, options };
    }
    case "interval": {
      const interval = parseIntervalAnswer(spec.answer ?? "", scope);
      return { ...base, interval, tolerance: Math.max(0, spec.tolerance ?? 0) };
    }
    case "sign_table": {
      const { label, signs } = parseSignAnswer(spec.answer);
      const roots = (spec.options ?? []).map((option) => ({ text: fill(option.text), correct: false }));
      if (roots.length > 6) throw new PracticeTemplateError("A sign table takes at most 6 roots");
      if (signs.length !== roots.length + 1) {
        throw new PracticeTemplateError(`${roots.length} root(s) make ${roots.length + 1} intervals - give that many signs (found ${signs.length})`);
      }
      distinctTexts(roots.map((root) => root.text));
      // Roots written as numbers must come in increasing order.
      const values = roots.map((root) => parseTypedValue(root.text.replace(/\$/g, "")));
      if (values.every((value) => value !== null)) {
        for (let i = 1; i < values.length; i++) {
          if (!(values[i]! > values[i - 1]!)) throw new PracticeTemplateError("Write the roots from smallest to largest");
        }
      }
      return { ...base, options: roots, signs, signLabel: label ? fill(label) : null };
    }
    case "expression": {
      const source = (spec.answer ?? "").trim().replace(/^\{\{(.*)\}\}$/, "$1").trim();
      if (!source) throw new PracticeTemplateError("An expression question needs an answer, like 2x + 3");
      let unknown: string | undefined;
      try {
        unknown = exprVariables(source).find((name) => name !== "x" && !Object.hasOwn(scope, name));
      } catch (error) {
        throw new PracticeTemplateError(`Answer "${source}": ${(error as Error).message}`);
      }
      if (unknown) throw new PracticeTemplateError(`Answer "${source}": "${unknown}" isn't defined - the answer is an expression in x`);
      const expression = substituteVariables(source, scope);
      if (expressionSamples(expression).length < 4) throw new PracticeTemplateError(`Answer "${source}" has no value for most x - check it`);
      return { ...base, expression };
    }
    case "true_false": {
      const value = trueFalseValue(spec.answer);
      if (value === null) throw new PracticeTemplateError("A true/false answer is Σωστό or Λάθος (true or false)");
      return { ...base, answer: value ? 1 : 0 };
    }
    case "number":
      return { ...base, answer: numberAnswer(spec.answer, scope, "A number question") };
    case "slider": {
      const min = Number(spec.sliderMin);
      const max = Number(spec.sliderMax);
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
        throw new PracticeTemplateError("A slider needs a range, like 0..10");
      }
      const step = spec.sliderStep && spec.sliderStep > 0 ? spec.sliderStep : niceStep(max - min);
      const answer = numberAnswer(spec.answer, scope, "A slider question");
      if (answer < min || answer > max) throw new PracticeTemplateError(`The answer ${round4(answer)} is outside the slider's ${min}..${max}`);
      const tolerance = spec.tolerance != null ? spec.tolerance : (max - min) / 40;
      return { ...base, answer, tolerance, slider: { min, max, step } };
    }
    case "point": {
      const parts = splitPoint(spec.answer ?? "");
      if (!parts) throw new PracticeTemplateError('A graph question needs an answer like "(2, 1)"');
      const x = numberAnswer(parts[0], scope, "A graph question");
      const y = numberAnswer(parts[1], scope, "A graph question");
      const graph = spec.graph ?? { xMin: -5, xMax: 5, yMin: -5, yMax: 5, plots: [] };
      if (x < graph.xMin || x > graph.xMax || y < graph.yMin || y > graph.yMax) {
        throw new PracticeTemplateError(`The point (${round4(x)}, ${round4(y)}) is outside the graph's window`);
      }
      // Plots keep x free; template variables are filled in now.
      const plots = graph.plots.map((plot) => substituteVariables(plot, scope));
      const tolerance = spec.tolerance != null ? spec.tolerance : 0.25;
      return { ...base, answer: x, answerY: y, tolerance, graph: { ...graph, plots } };
    }
  }
}

function distinctTexts(texts: string[]) {
  const keys = texts.map((text) => text.replace(/\s+/g, ""));
  if (new Set(keys).size !== keys.length) throw new PracticeTemplateError("Two items came out the same - each must be different");
}

const INFINITY = /^([+-]?)\s*(∞|inf|infinity|\\infty|άπειρο)$/i;

/** One endpoint: a number or expression, or ±∞ (as null with its sign). */
function intervalEnd(raw: string, scope: Record<string, number>): number | "-inf" | "+inf" {
  const text = raw.trim().replace(/^\$|\$$/g, "").replace(/[−–]/g, "-").trim();
  const inf = INFINITY.exec(text);
  if (inf) return inf[1] === "-" ? "-inf" : "+inf";
  return numberAnswer(text, scope, "An interval endpoint");
}

/**
 * "[-1, 3)", "(-∞, {{a}}]", "(2, +inf)" as an interval. Throws
 * PracticeTemplateError when it isn't one.
 */
export function parseIntervalAnswer(answer: string, scope: Record<string, number> = {}): PracticeInterval {
  const text = answer.trim().replace(/^\$|\$$/g, "").trim();
  const open = text[0];
  const close = text[text.length - 1];
  if (!"[(".includes(open) || !"])".includes(close) || text.length < 5) {
    throw new PracticeTemplateError('An interval answer looks like "[-1, 3)" or "(-∞, 2]"');
  }
  // The endpoints: split at the comma outside brackets (sqrt(2), max(a, b)).
  const inner = text.slice(1, -1);
  let depth = 0;
  let comma = -1;
  for (let i = 0; i < inner.length && comma < 0; i++) {
    if (inner[i] === "(") depth++;
    else if (inner[i] === ")") depth--;
    else if ((inner[i] === "," || inner[i] === ";") && depth === 0) comma = i;
  }
  if (comma < 0) throw new PracticeTemplateError('An interval has two endpoints, like "[-1, 3)"');
  const parts = [inner.slice(0, comma), inner.slice(comma + 1)];
  const lo = intervalEnd(parts[0], scope);
  const hi = intervalEnd(parts[1], scope);
  if (lo === "+inf" || hi === "-inf") throw new PracticeTemplateError("An interval runs from left to right: -∞ only on the left, +∞ only on the right");
  const interval: PracticeInterval = {
    lo: lo === "-inf" ? null : lo,
    hi: hi === "+inf" ? null : hi,
    loClosed: lo !== "-inf" && open === "[",
    hiClosed: hi !== "+inf" && close === "]",
  };
  if (interval.lo !== null && interval.hi !== null && !(interval.hi > interval.lo)) {
    throw new PracticeTemplateError(`The interval's left end (${round4(interval.lo)}) must be below its right end (${round4(interval.hi)})`);
  }
  return interval;
}

/** An interval written the school way: [−1, 3), (−∞, 2]. */
export function formatInterval(interval: PracticeInterval): string {
  const lo = interval.lo === null ? "-\\infty" : formatNumber(interval.lo, true);
  const hi = interval.hi === null ? "+\\infty" : formatNumber(interval.hi, true);
  return `$${interval.loClosed ? "[" : "("}${lo}, ${hi}${interval.hiClosed ? "]" : ")"}$`;
}

/**
 * A sign table's stored answer: "+ - +", optionally after the row's label
 * and a bar ("f'(x) | + - +"). Throws PracticeTemplateError when the signs
 * aren't + and -.
 */
export function parseSignAnswer(answer: string | null | undefined): { label: string | null; signs: number[] } {
  const text = (answer ?? "").trim();
  const bar = text.lastIndexOf("|");
  const label = bar >= 0 ? text.slice(0, bar).trim() || null : null;
  const body = (bar >= 0 ? text.slice(bar + 1) : text).replace(/[−–]/g, "-").replace(/[,;]/g, " ").trim();
  const signs = body.split(/\s+/).filter(Boolean);
  if (!signs.length || signs.some((sign) => sign !== "+" && sign !== "-")) {
    throw new PracticeTemplateError('A sign table\'s answer is its signs from left to right, like "+ - +"');
  }
  return { label, signs: signs.map((sign) => (sign === "+" ? 1 : -1)) };
}

/** Writes a sign table's answer the way it is stored. */
export function formatSignAnswer(label: string | null | undefined, signs: number[]): string {
  const body = signs.map((sign) => (sign > 0 ? "+" : "-")).join(" ");
  return label && label.trim() ? `${label.trim()} | ${body}` : body;
}

// Points an expression answer is compared at: spread out, avoiding the
// usual special values (0, ±1, integers) where different expressions agree.
const SAMPLE_X = [-3.71, -2.43, -1.37, -0.61, -0.29, 0.17, 0.53, 1.29, 1.83, 2.57, 3.19, 4.61];

/** [x, value] at the sample points where the expression has a finite value. */
function expressionSamples(expression: string): [number, number][] {
  const out: [number, number][] = [];
  for (const x of SAMPLE_X) {
    try {
      const value = evalExpr(expression, { x });
      if (Number.isFinite(value)) out.push([x, value]);
    } catch {
      return [];
    }
  }
  return out;
}

/** Replaces template variables in a plot expression with their values, keeping x. */
function substituteVariables(expr: string, scope: Record<string, number>): string {
  return expr.replace(/[A-Za-z_][A-Za-z0-9_]*/g, (name) =>
    name !== "x" && Object.hasOwn(scope, name) ? `(${scope[name]})` : name,
  );
}

const round4 = (value: number) => Math.round(value * 1e4) / 1e4;

function niceStep(span: number): number {
  const raw = span / 100;
  const power = 10 ** Math.floor(Math.log10(raw));
  const scaled = raw / power;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * power;
}

/**
 * Checks a question can be played: instantiates it (many times for a
 * template) and returns every distinct problem found, or [] if it's fine.
 */
export function validatePracticeQuestion(spec: PracticeQuestionSpec, samples = 40): string[] {
  const problems = new Set<string>();
  if (!spec.prompt || !spec.prompt.trim()) problems.add("Write the question");
  if (spec.origin != null && !["panhellenic", "textbook", "custom"].includes(spec.origin)) problems.add("Unknown source");
  if (spec.origin === "custom" && !(spec.originDetail ?? "").trim()) problems.add("Name the source");
  if ((spec.originDetail ?? "").trim().length > MAX_ORIGIN_DETAIL) {
    problems.add(`The source detail is too long (${MAX_ORIGIN_DETAIL} characters at most)`);
  }
  if (spec.type === "point" && spec.graph) {
    const g = spec.graph;
    try {
      if (g.plots.length && parseVariables(spec.variables).some((def) => def.name === "x")) {
        problems.add('Plots use x for the axis - give the variable another name');
      }
    } catch {
      // reported below
    }
    if (!(g.xMax > g.xMin) || !(g.yMax > g.yMin)) problems.add("The graph window runs backwards");
    for (const plot of g.plots) {
      try {
        const vars = exprVariables(plot).filter((name) => name !== "x");
        const defined = parseVariables(spec.variables).map((def) => def.name);
        const unknown = vars.find((name) => !defined.includes(name));
        if (unknown) problems.add(`Plot "${plot}": "${unknown}" isn't defined`);
      } catch (error) {
        problems.add(`Plot "${plot}": ${(error as Error).message}`);
      }
    }
  }
  let defs: VariableDef[] = [];
  try {
    defs = parseVariables(spec.variables);
  } catch (error) {
    problems.add((error as Error).message);
    return [...problems];
  }
  const runs = defs.length ? samples : 1;
  const rng = seededRng(12345);
  for (let i = 0; i < runs; i++) {
    try {
      const played = instantiate(spec, rng);
      for (const problem of figureProblems(played.figure)) problems.add(problem);
      if (spec.type === "number" && (spec.tolerance ?? 0) === 0 && Math.abs(played.answer * 100 - Math.round(played.answer * 100)) > 1e-6) {
        problems.add(`The answer can come out as ${round4(played.answer)} - round it (round(…, 2)) or set a tolerance`);
      }
    } catch (error) {
      if (error instanceof PracticeTemplateError || error instanceof PracticeExprError) problems.add(error.message);
      else throw error;
    }
  }
  return [...problems];
}

/** What a counterexample answer's mistake was, kept with the answer for the teacher. */
export type CounterexampleDetail = "claim" | "h" | "c" | "other";

/**
 * A counterexample question's two steps: the claim called true or false,
 * then (for a false claim called false) the option picked. Right only if
 * both are; otherwise which step failed - the claim, or a pick whose
 * hypothesis fails (h), whose conclusion holds (c), or another (other).
 */
export function checkCounterexample(
  question: PlayableQuestion,
  claimTrue: boolean,
  pick: number | null,
): { correct: boolean; detail: CounterexampleDetail | null } {
  const isTrue = question.answer === 1;
  if (claimTrue !== isTrue) return { correct: false, detail: "claim" };
  if (isTrue) return { correct: true, detail: null };
  const option = pick === null ? undefined : question.options[pick];
  if (option?.marker === "x") return { correct: true, detail: null };
  return { correct: false, detail: option?.marker === "h" ? "h" : option?.marker === "c" ? "c" : "other" };
}

/** What a typed counterexample turned out to be: right, or which kind of wrong; "unknown" when no option matches it. */
export type TypedCounterexampleResult = "right" | "h" | "c" | "other" | "unknown";

/** The same function as an option: equal wherever the option has a value (at least 3 sample points). */
function sameFunction(a: string, b: string): boolean {
  let compared = 0;
  for (const x of [-3.71, -2.43, -1.37, -0.61, -0.29, 0.17, 0.53, 1.29, 1.83, 2.57, 3.19, 4.61]) {
    let expected: number;
    let value: number;
    try {
      expected = evalExpr(b, { x });
      value = evalExpr(a, { x });
    } catch {
      return false;
    }
    if (!Number.isFinite(expected)) continue;
    if (!Number.isFinite(value) || Math.abs(value - expected) > 1e-6 * Math.max(1, Math.abs(expected))) return false;
    compared++;
  }
  return compared >= 3;
}

/**
 * Compares a typed counterexample (a function of x, and x₀ when the
 * question has one) with the teacher's options by value. A match takes the
 * option's marker; no match is "unknown" - v3a can't judge it, so the game
 * offers the options instead (v3b asks the AI).
 */
export function checkTypedCounterexample(question: PlayableQuestion, typed: string, x0: string | null): TypedCounterexampleResult {
  const index = matchTypedCounterexample(question, typed, x0);
  if (index === null) return "unknown";
  const marker = question.options[index].marker;
  return marker === "x" ? "right" : marker === "h" ? "h" : marker === "c" ? "c" : "other";
}

/** The option a typed counterexample is the same as (function, and point when the option has one), or null. */
export function matchTypedCounterexample(question: PlayableQuestion, typed: string, x0: string | null): number | null {
  const expr = parseTypedExpression(typed);
  if (!expr) return null;
  const point = x0 === null ? null : parseTypedValue(x0);
  const index = question.options.findIndex(
    (option) =>
      option.typed &&
      sameFunction(expr, option.typed.expr) &&
      (option.typed.x0 === null || (point !== null && Math.abs(point - option.typed.x0) <= 1e-9)),
  );
  return index >= 0 ? index : null;
}

/** Tick all that apply: right only when exactly the correct options are ticked. */
export function checkMulti(question: PlayableQuestion, ticked: number[]): boolean {
  const set = new Set(ticked);
  return question.options.every((option, i) => option.correct === set.has(i)) && [...set].every((i) => i >= 0 && i < question.options.length);
}

/** Ordering: `order` lists the options' indexes as the student put them. */
export function checkOrder(question: PlayableQuestion, order: number[]): boolean {
  return order.length === question.options.length && order.every((index, position) => question.options[index]?.text === question.options[position].text);
}

/** Matching: `pairs[i]` is the index of the option whose right side the student gave to item i. */
export function checkMatch(question: PlayableQuestion, pairs: (number | null)[]): boolean {
  return (
    pairs.length === question.options.length &&
    pairs.every((index, i) => index !== null && question.options[index]?.match === question.options[i].match)
  );
}

/** Sign table: the signs the student set, left to right. */
export function checkSigns(question: PlayableQuestion, signs: (number | null)[]): boolean {
  const answer = question.signs ?? [];
  return signs.length === answer.length && signs.every((sign, i) => sign === answer[i]);
}

/** Interval: both ends (within the tolerance) and both brackets. */
export function checkInterval(question: PlayableQuestion, given: PracticeInterval): boolean {
  const answer = question.interval;
  if (!answer) return false;
  const eps = Math.max(question.tolerance, 1e-6);
  const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) <= eps);
  return (
    same(given.lo, answer.lo) &&
    same(given.hi, answer.hi) &&
    (answer.lo === null || given.loClosed === answer.loClosed) &&
    (answer.hi === null || given.hiClosed === answer.hiClosed)
  );
}

/**
 * Reads a typed expression in x. null when it can't be read or uses a
 * name other than x (the game says so).
 */
export function parseTypedExpression(raw: string): string | null {
  const text = normalizeTyped(raw, ["x"]).trim();
  if (!text) return null;
  try {
    if (exprVariables(text).some((name) => name !== "x")) return null;
    evalExpr(text, { x: 0.37 });
    return text;
  } catch {
    return null;
  }
}

/**
 * Expression: the same function as the answer - equal at every sample
 * point where the answer has a value (so (x²−1)/(x−1) counts for x + 1).
 */
export function checkExpression(question: PlayableQuestion, typed: string): boolean {
  const given = parseTypedExpression(typed);
  if (!given || !question.expression) return false;
  const samples = expressionSamples(question.expression);
  if (samples.length < 4) return false;
  return samples.every(([x, expected]) => {
    const value = evalExpr(given, { x });
    return Number.isFinite(value) && Math.abs(value - expected) <= 1e-6 * Math.max(1, Math.abs(expected));
  });
}

/** Does the student's answer count? Tolerance applies to number, slider and point. */
export function isCorrect(question: PlayableQuestion, given: number | { x: number; y: number }): boolean {
  const eps = 1e-9;
  if (question.type === "point") {
    if (typeof given !== "object") return false;
    return (
      Math.abs(given.x - question.answer) <= question.tolerance + eps &&
      Math.abs(given.y - question.answerY) <= question.tolerance + eps
    );
  }
  if (typeof given !== "number") return false;
  if (question.type === "choice") return Boolean(question.options[given]?.correct);
  if (question.type === "true_false") return given === question.answer;
  return Math.abs(given - question.answer) <= question.tolerance + eps;
}

/**
 * A typed exact value: everything parseTypedNumber reads, and also √2,
 * 2π, 3/4, -√3/2, (1+√5)/2. null when it isn't a number.
 */
export function parseTypedValue(raw: string): number | null {
  const simple = parseTypedNumber(raw);
  if (simple !== null) return simple;
  const text = normalizeTyped(raw).trim();
  if (!text) return null;
  try {
    if (exprVariables(text).length) return null;
    const value = evalExpr(text);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

/** Reads a typed number the Greek way or the English way: "7,5", "7.5", "−3", "1/2". */
export function parseTypedNumber(raw: string): number | null {
  const text = raw.trim().replace(/[−–]/g, "-").replace(/\s+/g, "");
  if (!text) return null;
  const fraction = /^(-?\d+(?:[.,]\d+)?)\/(-?\d+(?:[.,]\d+)?)$/.exec(text);
  if (fraction) {
    const value = Number(fraction[1].replace(",", ".")) / Number(fraction[2].replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }
  if (!/^-?\d*(?:[.,]\d+)?$/.test(text) || text === "-" || text === "") return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
