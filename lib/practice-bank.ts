// The practice bank as the console sees it: sections and questions, and the
// mapping between database rows (snake_case) and PracticeQuestionSpec.
// Pure - shared by app/protected/teacher/practice-actions.ts and the
// Practice tab.

import { trueFalseValue, type PracticeGraph, type PracticeOption, type PracticeOrigin, type PracticeQuestionSpec, type PracticeQuestionType } from "@/lib/practice-template";

export interface PracticeSection {
  id: string;
  grade: string;
  name: string;
  position: number;
  isPublic: boolean;
  /** Active questions. */
  questionCount: number;
}

export interface PracticeQuestion extends PracticeQuestionSpec {
  id: string;
  sectionId: string;
  imagePath: string | null;
  source: "manual" | "quiz" | "import";
  sourceQuizQuestionId: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
}

export const PRACTICE_QUESTION_COLUMNS =
  "id, section_id, type, prompt, options, answer, tolerance, slider_min, slider_max, slider_step, graph, variables, condition, explanation, origin, origin_detail, image_path, source, source_quiz_question_id, position, is_active, created_at";

export type PracticeQuestionRow = {
  id: string;
  section_id: string;
  type: PracticeQuestionType;
  prompt: string;
  options: PracticeOption[] | null;
  answer: string | null;
  tolerance: number | string | null;
  slider_min: number | string | null;
  slider_max: number | string | null;
  slider_step: number | string | null;
  graph: PracticeGraph | null;
  variables: string | null;
  condition: string | null;
  explanation: string | null;
  origin: PracticeOrigin | null;
  origin_detail: string | null;
  image_path: string | null;
  source: "manual" | "quiz" | "import";
  source_quiz_question_id: string | null;
  position: number;
  is_active: boolean;
  created_at: string;
};

const num = (value: number | string | null): number | null =>
  value === null || value === undefined ? null : Number(value);

export function toPracticeQuestion(row: PracticeQuestionRow): PracticeQuestion {
  return {
    id: row.id,
    sectionId: row.section_id,
    type: row.type,
    prompt: row.prompt,
    options: row.options,
    answer: row.answer,
    tolerance: num(row.tolerance),
    sliderMin: num(row.slider_min),
    sliderMax: num(row.slider_max),
    sliderStep: num(row.slider_step),
    graph: row.graph,
    variables: row.variables,
    condition: row.condition,
    explanation: row.explanation,
    origin: row.origin ?? null,
    originDetail: row.origin_detail ?? null,
    imagePath: row.image_path,
    source: row.source,
    sourceQuizQuestionId: row.source_quiz_question_id,
    position: row.position,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

/** Only the columns that belong to the question's type are stored. */
export function toPracticeQuestionColumns(spec: PracticeQuestionSpec) {
  const clean = (text: string | null | undefined) => {
    const trimmed = (text ?? "").trim();
    return trimmed ? trimmed : null;
  };
  return {
    type: spec.type,
    prompt: spec.prompt.trim(),
    options:
      spec.type === "choice"
        ? (spec.options ?? []).map((option) => ({ text: option.text.trim(), correct: Boolean(option.correct) }))
        : spec.type === "counterexample" && trueFalseValue(spec.answer) === false
          ? (spec.options ?? []).map((option) => {
              const marker = option.marker ?? (option.correct ? "x" : "");
              return { text: option.text.trim(), correct: marker === "x", marker, reason: clean(option.reason) };
            })
          : null,
    // True/false is stored as "true"/"false" (a check on the table), however
    // it was written ("Σωστό", "Λάθος"...).
    answer:
      spec.type === "choice"
        ? null
        : spec.type === "true_false" || spec.type === "counterexample"
          ? trueFalseValue(spec.answer) === false
            ? "false"
            : "true"
          : clean(spec.answer),
    tolerance: spec.type === "number" || spec.type === "slider" || spec.type === "point" ? spec.tolerance ?? null : null,
    slider_min: spec.type === "slider" ? spec.sliderMin ?? null : null,
    slider_max: spec.type === "slider" ? spec.sliderMax ?? null : null,
    slider_step: spec.type === "slider" ? spec.sliderStep ?? null : null,
    graph: spec.type === "point" ? spec.graph ?? { xMin: -5, xMax: 5, yMin: -5, yMax: 5, plots: [] } : null,
    variables: clean(spec.variables),
    condition: clean(spec.condition),
    explanation: clean(spec.explanation),
    origin: spec.origin ?? null,
    origin_detail: spec.origin ? clean(spec.originDetail) : null,
  };
}

export const PRACTICE_IMAGES_BUCKET = "practice-images";

/** A public URL for a question image (the bucket is public). */
export function practiceImageUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  return `${base}/storage/v1/object/public/${PRACTICE_IMAGES_BUCKET}/${path}`;
}

/** Quiz questions that can be copied into practice, and how they'd come over. */
export interface CopyableQuizQuestion {
  id: string;
  prompt: string;
  /** null when it can't be played automatically (free-text answer). */
  becomes: PracticeQuestionType | null;
  alreadyCopied: boolean;
}

/**
 * How a quiz question maps to a practice question. Short answers come over
 * only when their model answer is a plain number.
 */
export function quizQuestionToPractice(question: {
  question_text: string;
  question_type: "multiple_choice" | "true_false" | "short_answer";
  model_answer: string | null;
  options: { option_text: string; is_correct: boolean; order_index: number }[];
}): PracticeQuestionSpec | null {
  if (question.question_type === "multiple_choice") {
    const options = [...question.options]
      .sort((a, b) => a.order_index - b.order_index)
      .map((option) => ({ text: option.option_text, correct: option.is_correct }));
    if (options.length < 2 || options.length > 6 || options.filter((option) => option.correct).length !== 1) return null;
    return { type: "choice", prompt: question.question_text, options };
  }
  if (question.question_type === "true_false") {
    const trueOption = question.options.find((option) => /^(true|σωστό)$/i.test(option.option_text.trim()));
    if (!trueOption) return null;
    return { type: "true_false", prompt: question.question_text, answer: trueOption.is_correct ? "true" : "false" };
  }
  const model = (question.model_answer ?? "").trim().replace(/^\$(.*)\$$/, "$1").replace(/[−–]/g, "-");
  if (/^-?\d+(?:[.,]\d+)?$/.test(model)) {
    return { type: "number", prompt: question.question_text, answer: model.replace(",", ".") };
  }
  return null;
}

/** One student's practice, for the console's Progress view. */
export interface PracticeStudentProgress {
  studentId: string;
  name: string;
  classes: string[];
  /** Answers in the last 7 days, and how many right. */
  week: { answers: number; right: number; days: number };
  allTime: { answers: number; right: number };
  lastPracticed: string | null;
  dailyStreak: number;
  mistakes: number;
  points: number;
  /** Per section: name and answers/right (last 30 days). */
  sections: { sectionId: string; name: string; answers: number; right: number }[];
}

export interface PracticeReport {
  id: string;
  questionId: string;
  sectionId: string | null;
  questionPrompt: string;
  playedPrompt: string | null;
  message: string | null;
  studentName: string | null;
  createdAt: string;
}

type AnswerRow = { student_id: string; section_id: string | null; correct: boolean; answered_at: string };

/**
 * Folds answer rows into per-student numbers. `now` and the Athens day
 * function are passed in so this stays pure (tests/practice-bank.test.ts).
 */
export function summarizeAnswers(
  answers: AnswerRow[],
  now: Date,
  dayOf: (iso: string) => string,
): Map<string, { week: PracticeStudentProgress["week"]; recent: Map<string, { answers: number; right: number }>; last: string | null }> {
  const weekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const out = new Map<string, { week: PracticeStudentProgress["week"]; recent: Map<string, { answers: number; right: number }>; last: string | null; weekDays: Set<string> }>();
  for (const row of answers) {
    const entry = out.get(row.student_id) ?? { week: { answers: 0, right: 0, days: 0 }, recent: new Map(), last: null, weekDays: new Set<string>() };
    if (Date.parse(row.answered_at) >= weekAgo) {
      entry.week.answers++;
      if (row.correct) entry.week.right++;
      entry.weekDays.add(dayOf(row.answered_at));
    }
    if (row.section_id) {
      const section = entry.recent.get(row.section_id) ?? { answers: 0, right: 0 };
      section.answers++;
      if (row.correct) section.right++;
      entry.recent.set(row.section_id, section);
    }
    if (!entry.last || row.answered_at > entry.last) entry.last = row.answered_at;
    out.set(row.student_id, entry);
  }
  return new Map([...out].map(([id, entry]) => [id, { week: { ...entry.week, days: entry.weekDays.size }, recent: entry.recent, last: entry.last }]));
}

const squash = (text: unknown) => (typeof text === "string" ? text.replace(/\s+/g, " ").trim() : (text ?? null));

/**
 * What makes two questions "the same" for duplicate checks: the question
 * as played - type, text, options, answer, numbers settings, graph,
 * variables - ignoring spacing. The explanation, source and image don't
 * count, so a reworded explanation is still a duplicate.
 */
export function practiceQuestionKey(spec: PracticeQuestionSpec): string {
  const c = toPracticeQuestionColumns(spec);
  return JSON.stringify([
    c.type,
    squash(c.prompt),
    c.options ? c.options.map((option) => [squash(option.text), option.correct, "marker" in option ? option.marker : null, "reason" in option ? squash(option.reason) : null]) : null,
    squash(c.answer),
    c.tolerance ?? null,
    c.slider_min ?? null,
    c.slider_max ?? null,
    c.slider_step ?? null,
    c.graph ? [c.graph.xMin, c.graph.xMax, c.graph.yMin, c.graph.yMax, c.graph.plots.map(squash)] : null,
    squash(c.variables),
    squash(c.condition),
  ]);
}

/**
 * The later copies among questions (in the order given): every question
 * whose key matches an earlier one. The first copy is the one kept.
 */
export function duplicateQuestions<T extends PracticeQuestionSpec>(questions: T[]): T[] {
  const seen = new Set<string>();
  const duplicates: T[] = [];
  for (const question of questions) {
    const key = practiceQuestionKey(question);
    if (seen.has(key)) duplicates.push(question);
    else seen.add(key);
  }
  return duplicates;
}
