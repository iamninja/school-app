import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared by the teacher's manual grading action and the student-submission
 * path's AI auto-grading - both ultimately just "write a short-answer
 * grade, then recompute the attempt's total score."
 */

export async function recomputeAttemptScore(
  supabase: SupabaseClient,
  attemptId: string,
): Promise<void> {
  const { data: rows } = await supabase
    .from("quiz_attempt_answers")
    .select("points_awarded")
    .eq("attempt_id", attemptId);

  const total = (rows ?? []).reduce(
    (sum: number, row: { points_awarded: number | null }) =>
      sum + (row.points_awarded ?? 0),
    0,
  );

  await supabase.from("quiz_attempts").update({ score: total }).eq("id", attemptId);
}

export async function recomputeBestScore(
  supabase: SupabaseClient,
  attemptId: string,
): Promise<void> {
  const { data: rows } = await supabase
    .from("quiz_attempt_best_answers")
    .select("points_awarded")
    .eq("attempt_id", attemptId);

  const total = (rows ?? []).reduce(
    (sum: number, row: { points_awarded: number | null }) =>
      sum + (row.points_awarded ?? 0),
    0,
  );

  await supabase
    .from("quiz_attempt_bests")
    .update({ score: total })
    .eq("attempt_id", attemptId);
}

export interface ApplyShortAnswerGradeParams {
  table: "quiz_attempt_answers" | "quiz_attempt_best_answers";
  answerId: string;
  attemptId: string;
  isCorrect: boolean;
  pointsPossible: number;
  // Only recorded on quiz_attempt_answers - see the migration comment for
  // why quiz_attempt_best_answers doesn't track provenance.
  gradedBy: "teacher" | "ai";
  reasoning?: string | null;
  // undefined = don't touch the comment; null/string = set it.
  comment?: string | null;
}

/**
 * Writes a short-answer grade to either the official or best-attempt
 * answer row and recomputes the matching attempt's total score. Never
 * checks ownership/authorization itself - callers (gradeShortAnswerAction,
 * regradeShortAnswerWithAiAction, submitQuizAttemptAction's AI pass) are
 * each responsible for that in whatever way fits their own auth context.
 */
export async function applyShortAnswerGrade(
  supabase: SupabaseClient,
  params: ApplyShortAnswerGradeParams,
): Promise<void> {
  const pointsAwarded = params.isCorrect ? params.pointsPossible : 0;

  const update: Record<string, unknown> = {
    is_correct: params.isCorrect,
    points_awarded: pointsAwarded,
  };

  if (params.table === "quiz_attempt_answers") {
    update.graded_by = params.gradedBy;
    // Clears any stale AI reasoning once a teacher grades/overrides by hand.
    update.ai_reasoning =
      params.gradedBy === "ai" ? (params.reasoning ?? null) : null;
  }

  if (params.comment !== undefined) {
    update.teacher_comment = params.comment?.trim() || null;
  }

  const { error } = await supabase
    .from(params.table)
    .update(update)
    .eq("id", params.answerId);

  if (error) {
    throw error;
  }

  if (params.table === "quiz_attempt_answers") {
    await recomputeAttemptScore(supabase, params.attemptId);
  } else {
    await recomputeBestScore(supabase, params.attemptId);
  }
}
