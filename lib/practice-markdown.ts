// Practice questions in the app's quiz Markdown style (lib/quiz-markdown.ts),
// extended for the practice types. The format is written up for people and
// for AI in lib/practice-markdown-template.ts (the downloadable template).
// Pure; tests in tests/practice-markdown.test.ts.
//
//   # Η ευθεία                    optional: the section to import into
//                                 (each "# " heading starts another one)
//
//   ## Ποια είναι η κλίση της $y = 3x - 2$;
//   - [x] $3$
//   - [ ] $-2$
//   Explanation: Στη μορφή $y = λx + β$ η κλίση είναι το $λ$.
//
//   ## Λύσε ${{a}}x {{+b}} = {{c}}$.
//   Answer: x
//   Variables: a=2..9, x=-10..10, b=-20..20 !0, c=a*x+b
//
// A question is a "## " heading; lines under it up to the first option or
// "Key: value" line continue the question text. Keys (any case): Type,
// Answer, Tolerance, Range, Step, Window, Plot (repeatable), Variables,
// Condition, Explanation (may run over several lines), Source (or Πηγή:
// "Πανελλαδικές 2019 · Θέμα Β", "Σχολικό βιβλίο σελ. 45" or any other
// name - lib/practice-template.ts parseOriginText). The type is worked
// out from what's there when Type is left out. The quiz-style heading
// attributes "{type=..., answer=...}" are accepted too.

import {
  parseOriginText,
  trueFalseValue,
  type CounterexampleMarker,
  validatePracticeQuestion,
  type PracticeGraph,
  type PracticeQuestionSpec,
  type PracticeQuestionType,
} from "@/lib/practice-template";

export interface ParsedPracticeMarkdown {
  /** The first "# " heading above the questions, if the file names a section. */
  sectionName: string | null;
  questions: PracticeQuestionSpec[];
  /**
   * For each question, the "# " heading it sits under (a file can hold
   * several sections), or null for questions before any heading.
   */
  sectionNames: (string | null)[];
  /** Every problem, prefixed "Question N:" - empty when the file is good. */
  errors: string[];
}

const TYPE_ALIASES: Record<string, PracticeQuestionType> = {
  choice: "choice",
  multiple_choice: "choice",
  mc: "choice",
  true_false: "true_false",
  truefalse: "true_false",
  tf: "true_false",
  number: "number",
  numeric: "number",
  slider: "slider",
  point: "point",
  graph: "point",
  counterexample: "counterexample",
  "αντιπαράδειγμα": "counterexample",
  "αντιπαραδειγμα": "counterexample",
  multi: "multi",
  multiple: "multi",
  multiple_answer: "multi",
  select_all: "multi",
  tick_all: "multi",
  checkbox: "multi",
  interval: "interval",
  "διάστημα": "interval",
  "διαστημα": "interval",
  order: "order",
  ordering: "order",
  sort: "order",
  "σειρά": "order",
  "σειρα": "order",
  "ταξινόμηση": "order",
  "ταξινομηση": "order",
  match: "match",
  matching: "match",
  pairs: "match",
  "αντιστοίχιση": "match",
  "αντιστοιχιση": "match",
  sign_table: "sign_table",
  signs: "sign_table",
  sign: "sign_table",
  "πρόσημα": "sign_table",
  "προσημα": "sign_table",
  "πίνακας_προσήμων": "sign_table",
  "πινακας_προσημων": "sign_table",
  expression: "expression",
  expr: "expression",
  "παράσταση": "expression",
  "παρασταση": "expression",
};

const TYPE_LIST = "choice, multi, true_false, number, slider, point, interval, order, match, sign_table, expression or counterexample";

const KEYS = ["type", "answer", "tolerance", "range", "step", "window", "plot", "roots", "row", "variables", "condition", "explanation", "source"] as const;
type Key = (typeof KEYS)[number];
/** Other spellings of a key ("Πηγή: ..." for "Source: ..."). */
const KEY_ALIASES: Record<string, Key> = { "πηγή": "source", "πηγη": "source", "origin": "source", "ρίζες": "roots", "ριζες": "roots" };
const keyName = (raw: string): Key => (KEY_ALIASES[raw.toLowerCase()] ?? raw.toLowerCase()) as Key;

const KEY_LINE = new RegExp(`^\\s*(${[...KEYS, ...Object.keys(KEY_ALIASES)].join("|")})\\s*:\\s*(.*)$`, "iu");
// [x] right / [ ] wrong; counterexample questions also take [h] (hypothesis
// fails) and [c] (conclusion holds).
const OPTION_LINE = /^\s*[-*]\s*\[([ xXhHcC])\]\s*(.+?)\s*$/;
/** An indented line right under an option: that option's reason (counterexample questions). */
const INDENTED = /^[ \t]+\S/;
/** "1. text" - an item of an ordering question, in the right order. */
const ITEM_LINE = /^\s*\d+[.)]\s+(.+?)\s*$/;
/** "- left -> right" - a pair of a matching question. */
const PAIR_LINE = /^\s*[-*]\s+(?!\[[ xXhHcC]\])(.+?)\s*$/;

/** Splits "left -> right" (or →) at the first arrow outside $...$. */
function splitPair(text: string): [string, string] | null {
  let inMath = false;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "$" && text[i - 1] !== "\\") inMath = !inMath;
    if (inMath) continue;
    for (const arrow of [" -> ", " → ", " ⟶ "]) {
      if (text.startsWith(arrow, i)) return [text.slice(0, i).trim(), text.slice(i + arrow.length).trim()];
    }
  }
  return null;
}

/** "-1, $\\frac{1}{2}$, 3" -> roots, split at commas outside $...$ and brackets. */
function splitRoots(raw: string): string[] {
  const text = raw.trim();
  if (/^(none|no|-|—|καμία|καμια|δεν έχει|δεν εχει|∅)$/i.test(text)) return [];
  const parts: string[] = [];
  let depth = 0;
  let inMath = false;
  let current = "";
  for (const ch of text) {
    if (ch === "$") inMath = !inMath;
    if (!inMath && "({[".includes(ch)) depth++;
    if (!inMath && ")}]".includes(ch)) depth--;
    if ((ch === "," || ch === ";") && depth === 0 && !inMath) {
      parts.push(current.trim());
      current = "";
    } else current += ch;
  }
  parts.push(current.trim());
  return parts.filter(Boolean);
}
const ATTRIBUTE_TAIL = /^(.*?)\s*\{((?:\s*[a-z_]+\s*=[^,}]*,?)+)\}\s*$/i;

function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(/[−–]/g, "-");
  if (!/^-?\d+(?:[.,]\d+)?$/.test(text)) return null;
  return Number(text.replace(",", "."));
}

/** "-1..5" -> [-1, 5] */
function parseRange(raw: string): [number, number] | null {
  const match = /^\s*(-?\d+(?:[.,]\d+)?)\s*\.\.\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(raw.replace(/[−–]/g, "-"));
  if (!match) return null;
  return [Number(match[1].replace(",", ".")), Number(match[2].replace(",", "."))];
}

export function parsePracticeMarkdown(source: string): ParsedPracticeMarkdown {
  const lines = source.replace(/\r\n/g, "\n").replace(/<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, "")).split("\n");
  const errors: string[] = [];
  const questions: PracticeQuestionSpec[] = [];

  const sectionNames: (string | null)[] = [];
  const starts: number[] = [];
  const headings: { index: number; name: string }[] = [];
  lines.forEach((line, index) => {
    if (/^##\s+\S/.test(line)) starts.push(index);
    else if (/^#\s+\S/.test(line)) {
      headings.push({ index, name: line.replace(/^#\s+/, "").replace(/^section\s*:\s*/i, "").trim() });
    }
  });
  const sectionName = headings.find((heading) => starts.length === 0 || heading.index < starts[0])?.name ?? null;
  if (starts.length === 0) {
    return { sectionName, questions, sectionNames, errors: ['No questions found - start each one with a "## " heading.'] };
  }

  starts.forEach((start, index) => {
    const number = index + 1;
    // A question runs to the next question or the next section heading.
    const nextHeading = headings.find((heading) => heading.index > start)?.index ?? lines.length;
    const end = Math.min(index + 1 < starts.length ? starts[index + 1] : lines.length, nextHeading);
    sectionNames.push([...headings].reverse().find((heading) => heading.index < start)?.name ?? null);
    const problems: string[] = [];
    let heading = lines[start].replace(/^##\s+/, "");

    const values = new Map<Key, string>();
    const plots: string[] = [];
    const attributeMatch = ATTRIBUTE_TAIL.exec(heading);
    if (attributeMatch) {
      heading = attributeMatch[1];
      for (const pair of attributeMatch[2].split(",")) {
        const eq = pair.indexOf("=");
        if (eq < 0) continue;
        const key = keyName(pair.slice(0, eq).trim());
        const value = pair.slice(eq + 1).trim();
        if (KEYS.includes(key) && value) {
          if (key === "plot") plots.push(value);
          else values.set(key, value);
        }
      }
    }

    const promptLines = [heading.trim()];
    const options: { text: string; marker: CounterexampleMarker; reasonLines: string[] }[] = [];
    const items: string[] = [];
    const pairs: [string, string][] = [];
    let lastOption: (typeof options)[number] | null = null;
    let bodyStarted = false;
    let explanationLines: string[] | null = null;

    for (const line of lines.slice(start + 1, end)) {
      const option = OPTION_LINE.exec(line);
      const key = KEY_LINE.exec(line);
      if (option) {
        bodyStarted = true;
        explanationLines = null;
        const mark = option[1].toLowerCase();
        lastOption = { text: option[2], marker: (mark === " " ? "" : mark) as CounterexampleMarker, reasonLines: [] };
        options.push(lastOption);
      } else if (!key && ITEM_LINE.test(line)) {
        bodyStarted = true;
        explanationLines = null;
        lastOption = null;
        items.push(ITEM_LINE.exec(line)![1]);
      } else if (!key && PAIR_LINE.test(line) && splitPair(PAIR_LINE.exec(line)![1])) {
        bodyStarted = true;
        explanationLines = null;
        lastOption = null;
        pairs.push(splitPair(PAIR_LINE.exec(line)![1])!);
      } else if (lastOption && INDENTED.test(line) && !key) {
        lastOption.reasonLines.push(line.trim());
      } else if (key) {
        bodyStarted = true;
        lastOption = null;
        const name = keyName(key[1]);
        const value = key[2].trim();
        if (name === "explanation") {
          explanationLines = [value];
        } else {
          explanationLines = null;
          if (name === "plot") plots.push(value);
          else values.set(name, value);
        }
      } else if (explanationLines) {
        explanationLines.push(line);
      } else if (!bodyStarted) {
        promptLines.push(line);
      } else if (line.trim()) {
        lastOption = null;
        problems.push(`didn't understand "${line.trim().slice(0, 60)}" (options start with "- [ ]", settings with "Answer:", "Range:"…)`);
      }
    }
    if (explanationLines) values.set("explanation", explanationLines.join("\n").trim());

    const prompt = promptLines.join("\n").trim();
    const answer = values.get("answer") ?? null;

    // The type: as written, or worked out from what's there.
    let type: PracticeQuestionType | null = null;
    const typeRaw = values.get("type");
    if (typeRaw) {
      type = TYPE_ALIASES[typeRaw.toLowerCase().replace(/[\s-]/g, "_")] ?? null;
      if (!type) problems.push(`unknown type "${typeRaw}" (use ${TYPE_LIST})`);
    }
    if (!type) {
      if (options.length) type = options.filter((option) => option.marker === "x").length > 1 ? "multi" : "choice";
      else if (items.length) type = "order";
      else if (pairs.length) type = "match";
      else if (values.has("roots")) type = "sign_table";
      else if (values.has("range")) type = "slider";
      else if (values.has("window") || plots.length || (answer && /^\(.*[,;].*\)$/.test(answer.trim()))) type = "point";
      else if (answer && trueFalseValue(answer) !== null && !/^\s*[αψσλ]\s*$/i.test(answer)) type = "true_false";
      else type = "number";
    }

    const spec: PracticeQuestionSpec = {
      type,
      prompt,
      variables: values.get("variables") || null,
      condition: values.get("condition") || null,
      explanation: values.get("explanation") || null,
      ...parseOriginText(values.get("source")),
    };

    const toleranceRaw = values.get("tolerance");
    if (toleranceRaw !== undefined) {
      const tolerance = parseNumber(toleranceRaw.replace(/^±/, ""));
      if (tolerance === null || tolerance < 0) problems.push(`Tolerance must be a number like 0.1`);
      else spec.tolerance = tolerance;
    }

    const reasons = options.some((option) => option.reasonLines.length > 0);
    const counterMarks = options.some((option) => option.marker === "h" || option.marker === "c");
    if (type === "counterexample") {
      spec.answer = answer;
      const claimTrue = trueFalseValue(answer);
      if (!answer) problems.push('needs "Answer: Σωστό" (the claim is true) or "Answer: Λάθος"');
      else if (claimTrue === null) problems.push(`the answer is Σωστό or Λάθος (Αληθής/Ψευδής), not "${answer}"`);
      else if (claimTrue) {
        if (options.length) problems.push('a true claim has no options - leave them out, or the answer is "Λάθος"');
      } else {
        spec.options = options.map((option) => ({
          text: option.text,
          correct: option.marker === "x",
          marker: option.marker,
          reason: option.reasonLines.join(" ") || null,
        }));
        if (options.length < 2 || options.length > 6) problems.push('a false claim needs 2 to 6 options to pick the counterexample from ("- [x]", "- [h]", "- [c]", "- [ ]")');
        const found = options.filter((option) => option.marker === "x").length;
        if (found !== 1) problems.push(`needs exactly one counterexample "- [x]" (found ${found})`);
      }
      if (values.has("variables") || values.has("condition")) {
        problems.push("random numbers (Variables, Condition) aren't supported in counterexample questions yet");
      }
    } else if (counterMarks) {
      problems.push('[h] and [c] marks only go with "Type: counterexample"');
    } else if (reasons) {
      problems.push('lines under an option only go with "Type: counterexample" (they give its reason)');
    } else if (type === "choice" || type === "multi") {
      spec.options = options.map((option) => ({ text: option.text, correct: option.marker === "x" }));
      const max = type === "multi" ? 8 : 6;
      if (options.length < 2) problems.push('needs at least 2 options ("- [ ] text")');
      if (options.length > max) problems.push(`can have at most ${max} options`);
      const correct = options.filter((option) => option.marker === "x").length;
      if (type === "choice" && correct !== 1) problems.push(`needs exactly one correct option "- [x]" (found ${correct})`);
      if (type === "multi" && correct < 1) problems.push('needs at least one correct option "- [x]"');
    } else if (options.length) {
      problems.push(`"- [ ]" options only go with multiple choice, multi and counterexample, not ${type}`);
    }

    if (type !== "order" && items.length) problems.push('numbered items ("1. ...") only go with "Type: order"');
    if (type !== "match" && pairs.length) problems.push('pairs ("- left -> right") only go with "Type: match"');
    if (type !== "sign_table" && (values.has("roots") || values.has("row"))) problems.push('Roots and Row only go with "Type: sign_table"');

    if (type === "order") {
      spec.options = items.map((text) => ({ text, correct: false }));
      if (items.length < 2 || items.length > 8) problems.push('needs 2 to 8 items, in the right order ("1. ...", "2. ...")');
      if (answer) problems.push('an ordering question has no "Answer:" - the items are written in the right order');
    } else if (type === "match") {
      spec.options = pairs.map(([text, match]) => ({ text, correct: false, match }));
      if (pairs.length < 2 || pairs.length > 6) problems.push('needs 2 to 6 pairs ("- left -> right")');
      if (answer) problems.push('a matching question has no "Answer:" - each pair is written "- left -> right"');
    } else if (type === "sign_table") {
      const rootsRaw = values.get("roots");
      if (rootsRaw === undefined) problems.push('needs "Roots: -1, 2" (smallest first; "Roots: none" for none)');
      spec.options = splitRoots(rootsRaw ?? "").map((text) => ({ text, correct: false }));
      if (!answer) problems.push('needs the signs from left to right, like "Answer: + - +"');
      const row = values.get("row")?.trim();
      spec.answer = answer ? (row ? `${row} | ${answer}` : answer) : null;
    } else if (type !== "choice" && type !== "multi" && type !== "counterexample") {
      spec.answer = answer;
      if (!answer) problems.push(`needs an "Answer:" line`);
    }

    if (type === "slider") {
      const range = parseRange(values.get("range") ?? "");
      if (!range) problems.push('a slider needs "Range: 0..10"');
      else [spec.sliderMin, spec.sliderMax] = range;
      const step = values.get("step");
      if (step !== undefined) {
        const parsed = parseNumber(step);
        if (parsed === null || parsed <= 0) problems.push("Step must be a number above 0");
        else spec.sliderStep = parsed;
      }
    }

    if (type === "point") {
      const graph: PracticeGraph = { xMin: -5, xMax: 5, yMin: -5, yMax: 5, plots };
      const window = values.get("window");
      if (window) {
        const parts = window.split(/[,;]/);
        const x = parts[0] ? parseRange(parts[0]) : null;
        const y = parts[1] ? parseRange(parts[1]) : x;
        if (!x || !y) problems.push('Window must look like "-1..5, -2..6" (x range, then y range)');
        else [graph.xMin, graph.xMax, graph.yMin, graph.yMax] = [x[0], x[1], y[0], y[1]];
      }
      spec.graph = graph;
    }

    if (!problems.length) {
      for (const problem of validatePracticeQuestion(spec)) problems.push(problem);
    }
    for (const problem of problems) {
      const label = prompt ? `"${prompt.split("\n")[0].slice(0, 40)}${prompt.length > 40 ? "…" : ""}"` : "";
      errors.push(`Question ${number}${label ? ` ${label}` : ""}: ${problem}`);
    }
    questions.push(spec);
  });

  return { sectionName, questions, sectionNames, errors };
}
