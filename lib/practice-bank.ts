// The practice bank as the console sees it: sections and questions, and the
// mapping between database rows (snake_case) and PracticeQuestionSpec.
// Pure - shared by app/protected/teacher/practice-actions.ts and the
// Practice tab.

import type { PracticeGraph, PracticeQuestionSpec, PracticeQuestionType } from "@/lib/practice-template";

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
  "id, section_id, type, prompt, options, answer, tolerance, slider_min, slider_max, slider_step, graph, variables, condition, explanation, image_path, source, source_quiz_question_id, position, is_active, created_at";

export type PracticeQuestionRow = {
  id: string;
  section_id: string;
  type: PracticeQuestionType;
  prompt: string;
  options: { text: string; correct: boolean }[] | null;
  answer: string | null;
  tolerance: number | string | null;
  slider_min: number | string | null;
  slider_max: number | string | null;
  slider_step: number | string | null;
  graph: PracticeGraph | null;
  variables: string | null;
  condition: string | null;
  explanation: string | null;
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
    options: spec.type === "choice"
      ? (spec.options ?? []).map((option) => ({ text: option.text.trim(), correct: Boolean(option.correct) }))
      : null,
    answer: spec.type === "choice" ? null : clean(spec.answer),
    tolerance: spec.type === "number" || spec.type === "slider" || spec.type === "point" ? spec.tolerance ?? null : null,
    slider_min: spec.type === "slider" ? spec.sliderMin ?? null : null,
    slider_max: spec.type === "slider" ? spec.sliderMax ?? null : null,
    slider_step: spec.type === "slider" ? spec.sliderStep ?? null : null,
    graph: spec.type === "point" ? spec.graph ?? { xMin: -5, xMax: 5, yMin: -5, yMax: 5, plots: [] } : null,
    variables: clean(spec.variables),
    condition: clean(spec.condition),
    explanation: clean(spec.explanation),
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
