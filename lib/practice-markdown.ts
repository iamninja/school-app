// Practice questions in the app's quiz Markdown style (lib/quiz-markdown.ts),
// extended for the practice types. The format is written up for people and
// for AI in lib/practice-markdown-template.ts (the downloadable template).
// Pure; tests in tests/practice-markdown.test.ts.
//
//   # Η ευθεία                    optional: the section to import into
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
  validatePracticeQuestion,
  type PracticeGraph,
  type PracticeQuestionSpec,
  type PracticeQuestionType,
} from "@/lib/practice-template";

export interface ParsedPracticeMarkdown {
  /** From a "# " line, if the file names its section. */
  sectionName: string | null;
  questions: PracticeQuestionSpec[];
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
};

const KEYS = ["type", "answer", "tolerance", "range", "step", "window", "plot", "variables", "condition", "explanation", "source"] as const;
type Key = (typeof KEYS)[number];
/** Other spellings of a key ("Πηγή: ..." for "Source: ..."). */
const KEY_ALIASES: Record<string, Key> = { "πηγή": "source", "πηγη": "source", "origin": "source" };
const keyName = (raw: string): Key => (KEY_ALIASES[raw.toLowerCase()] ?? raw.toLowerCase()) as Key;

const KEY_LINE = new RegExp(`^\\s*(${[...KEYS, ...Object.keys(KEY_ALIASES)].join("|")})\\s*:\\s*(.*)$`, "iu");
const OPTION_LINE = /^\s*[-*]\s*\[([ xX])\]\s*(.+?)\s*$/;
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

  let sectionName: string | null = null;
  const starts: number[] = [];
  lines.forEach((line, index) => {
    if (/^##\s+\S/.test(line)) starts.push(index);
    else if (sectionName === null && starts.length === 0 && /^#\s+\S/.test(line)) {
      sectionName = line.replace(/^#\s+/, "").replace(/^section\s*:\s*/i, "").trim();
    }
  });
  if (starts.length === 0) {
    return { sectionName, questions, errors: ['No questions found - start each one with a "## " heading.'] };
  }

  starts.forEach((start, index) => {
    const number = index + 1;
    const end = index + 1 < starts.length ? starts[index + 1] : lines.length;
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
    const options: { text: string; correct: boolean }[] = [];
    let bodyStarted = false;
    let explanationLines: string[] | null = null;

    for (const line of lines.slice(start + 1, end)) {
      const option = OPTION_LINE.exec(line);
      const key = KEY_LINE.exec(line);
      if (option) {
        bodyStarted = true;
        explanationLines = null;
        options.push({ text: option[2], correct: option[1].toLowerCase() === "x" });
      } else if (key) {
        bodyStarted = true;
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
      if (!type) problems.push(`unknown type "${typeRaw}" (use choice, true_false, number, slider or point)`);
    }
    if (!type) {
      if (options.length) type = "choice";
      else if (values.has("range")) type = "slider";
      else if (values.has("window") || plots.length || (answer && /^\(.*[,;].*\)$/.test(answer.trim()))) type = "point";
      else if (answer && /^(true|false|σωστό|σωστο|λάθος|λαθος)$/i.test(answer.trim())) type = "true_false";
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

    if (type === "choice") {
      spec.options = options;
      if (options.length < 2) problems.push('needs at least 2 options ("- [ ] text")');
      if (options.length > 6) problems.push("can have at most 6 options");
      const correct = options.filter((option) => option.correct).length;
      if (correct !== 1) problems.push(`needs exactly one correct option "- [x]" (found ${correct})`);
    } else {
      if (options.length) problems.push(`options only go with multiple choice, not ${type}`);
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

  return { sectionName, questions, errors };
}
