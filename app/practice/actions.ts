"use server";

import { headers } from "next/headers";

import { judgeCounterexampleWithAI, type AiCounterexampleVerdict } from "@/lib/ai-counterexample";
import { PRACTICE_QUESTION_COLUMNS, toPracticeQuestion, type PracticeQuestionRow } from "@/lib/practice-bank";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { canSeeQuestion, drawPracticeRound, getPracticeViewer, type RoundQuestion } from "@/lib/practice-server";
import { sanitizeProgress } from "@/lib/practice-progress";
import { allowAiCheck, allowDraw, allowReport } from "@/lib/practice-rate-limit";
import { instantiate, matchTypedCounterexample, parseTypedExpression, parseTypedValue, type CounterexampleDetail } from "@/lib/practice-template";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DrawRoundResult =
  | { ok: true; questions: RoundQuestion[] }
  | { ok: false; error: string };

/**
 * A new practice round. Open to guests (public sections only); the
 * centre's students and the teacher can play every section. Sections and
 * past mistakes come from the player; only ids are taken from them, and
 * what they may see is decided on the server.
 */
export async function drawPracticeRoundAction(input: {
  sectionIds?: string[];
  mistakeIds?: string[];
  mistakesOnly?: boolean;
}): Promise<DrawRoundResult> {
  const sectionIds = (input.sectionIds ?? []).filter((id) => UUID.test(id)).slice(0, 100);
  const mistakeIds = (input.mistakeIds ?? []).filter((id) => UUID.test(id)).slice(0, 300);
  const mistakesOnly = Boolean(input.mistakesOnly);
  if (!mistakesOnly && sectionIds.length === 0) return { ok: false, error: "Διάλεξε τουλάχιστον μία ενότητα." };
  if (mistakesOnly && mistakeIds.length === 0) return { ok: false, error: "Δεν έχεις λάθη να ξαναδείς." };

  const requestHeaders = await headers();
  const ip = (requestHeaders.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!allowDraw(ip)) {
    return { ok: false, error: "Πολλοί γύροι μέσα σε λίγο - περίμενε ένα λεπτό και ξαναδοκίμασε." };
  }

  const viewer = await getPracticeViewer();
  const questions = await drawPracticeRound(viewer, { sectionIds, mistakeIds, mistakesOnly });
  if (questions.length === 0) {
    return { ok: false, error: mistakesOnly ? "Τα λάθη σου δεν είναι πια διαθέσιμα." : "Δεν βρέθηκαν ερωτήσεις σε αυτές τις ενότητες." };
  }
  return { ok: true, questions };
}

export interface PracticeAnswerUpload {
  /** Made on the device per answer, so a retried upload is harmless. */
  clientId: string;
  questionId: string;
  sectionId: string;
  correct: boolean;
  points: number;
  answeredAt: string;
  /** Counterexample questions: what went wrong (lib/practice-template.ts checkCounterexample). */
  detail?: CounterexampleDetail | null;
  /** Counterexample step 2: picked from the options, typed, or switched to the options (v3). */
  mode?: "options" | "typed" | "switched" | null;
  /** What the student typed, for the teacher. */
  typed?: string | null;
}

const ANSWER_MODES = ["options", "typed", "switched"] as const;

const ANSWER_DETAILS: CounterexampleDetail[] = ["claim", "h", "c", "other"];

/**
 * Saves a logged-in student's practice: their progress (as the game keeps
 * it) and the answers since the last save. Guests have nothing to save
 * here - their progress stays in the browser.
 */
export async function syncPracticeProgressAction(input: {
  progress: unknown;
  answers: PracticeAnswerUpload[];
}): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  const viewer = await getPracticeViewer();
  if (viewer.kind !== "student") return { ok: false, error: "Only students' progress is saved to an account." };

  const progress = sanitizeProgress(input.progress);
  const now = Date.now();
  const answers = (input.answers ?? []).slice(0, 200).filter(
    (answer) =>
      answer &&
      typeof answer.clientId === "string" &&
      answer.clientId.length >= 8 &&
      answer.clientId.length <= 80 &&
      UUID.test(answer.questionId) &&
      UUID.test(answer.sectionId) &&
      Math.abs(now - Date.parse(answer.answeredAt)) < 7 * 24 * 60 * 60 * 1000,
  );

  // The student's own client: row-level security keeps each student to their own rows.
  const supabase = await createClient();
  const { error: progressError } = await supabase
    .from("practice_progress")
    .upsert({ student_id: viewer.studentId, data: progress, updated_at: new Date().toISOString() });
  if (progressError) return { ok: false, error: "Η πρόοδος δεν αποθηκεύτηκε - θα ξαναδοκιμάσω." };

  if (answers.length) {
    const { error } = await supabase.from("practice_answers").upsert(
      answers.map((answer) => ({
        student_id: viewer.studentId,
        client_id: answer.clientId,
        question_id: answer.questionId,
        section_id: answer.sectionId,
        correct: Boolean(answer.correct),
        points: Math.max(0, Math.min(100, Math.floor(Number(answer.points) || 0))),
        answered_at: new Date(answer.answeredAt).toISOString(),
        // Only when there is one: plain answers stay the same shape as before.
        ...(answer.detail && ANSWER_DETAILS.includes(answer.detail) ? { detail: answer.detail } : {}),
        ...(answer.mode && ANSWER_MODES.includes(answer.mode) ? { mode: answer.mode } : {}),
        ...(typeof answer.typed === "string" && answer.typed.trim() ? { typed: answer.typed.trim().slice(0, 200) } : {}),
      })),
      { onConflict: "student_id,client_id", ignoreDuplicates: true },
    );
    if (error) return { ok: false, error: "Οι απαντήσεις δεν αποθηκεύτηκαν - θα ξαναδοκιμάσω." };
  }
  return { ok: true, saved: answers.length };
}

/** "Something's wrong with this question" - from anyone who could play it. */
export async function reportPracticeQuestionAction(input: {
  questionId: string;
  message?: string | null;
  playedPrompt?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID.test(input.questionId)) return { ok: false, error: "Άγνωστη ερώτηση." };
  const requestHeaders = await headers();
  const ip = (requestHeaders.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!allowReport(ip)) return { ok: false, error: "Έστειλες ήδη αρκετές αναφορές - ευχαριστούμε!" };

  const viewer = await getPracticeViewer();
  if (!(await canSeeQuestion(viewer, input.questionId))) return { ok: false, error: "Άγνωστη ερώτηση." };

  const { error } = await createServiceRoleClient()
    .from("practice_reports")
    .insert({
      question_id: input.questionId,
      student_id: viewer.kind === "student" ? viewer.studentId : null,
      message: (input.message ?? "").trim().slice(0, 1000) || null,
      played_prompt: (input.playedPrompt ?? "").slice(0, 4000) || null,
    });
  if (error) return { ok: false, error: "Η αναφορά δεν στάλθηκε - ξαναδοκίμασε." };
  return { ok: true };
}

/** AI checks of typed counterexamples a student gets per 24 hours (counterexample v3b). */
const AI_CHECKS_PER_DAY = 20;

export type TypedCounterexampleCheck =
  | { ok: true; verdict: AiCounterexampleVerdict; reason: string; by: "ai" | "options" }
  | { ok: false; reason: "cap" | "unavailable" | "unreadable" };

const VERDICT_BY_MARKER: Record<string, AiCounterexampleVerdict> = { x: "valid", h: "hypothesis_fails", c: "conclusion_holds" };

/**
 * Checks a counterexample a student typed that matched none of the
 * teacher's options (counterexample v3b): by the options again on the
 * server, then by the Claude API - for logged-in students (capped per day)
 * and the teacher trying a question. Every AI check is kept for the
 * teacher (practice_ai_checks). Anything that goes wrong is
 * { ok: false } and the game offers the options instead.
 */
export async function checkTypedCounterexampleAction(input: {
  questionId: string;
  typed: string;
  x0?: string | null;
}): Promise<TypedCounterexampleCheck> {
  const viewer = await getPracticeViewer();
  if (viewer.kind !== "student" && viewer.kind !== "teacher") return { ok: false, reason: "unavailable" };
  if (!UUID.test(input.questionId) || typeof input.typed !== "string") return { ok: false, reason: "unreadable" };
  const typed = input.typed.trim().slice(0, 120);
  const x0 = typeof input.x0 === "string" && input.x0.trim() ? input.x0.trim().slice(0, 30) : null;
  const expr = parseTypedExpression(typed);
  if (!expr || (x0 !== null && parseTypedValue(x0) === null)) return { ok: false, reason: "unreadable" };
  if (!(await canSeeQuestion(viewer, input.questionId))) return { ok: false, reason: "unavailable" };

  const service = createServiceRoleClient();
  const { data: row } = await service.from("practice_questions").select(PRACTICE_QUESTION_COLUMNS).eq("id", input.questionId).maybeSingle();
  if (!row) return { ok: false, reason: "unavailable" };
  const spec = toPracticeQuestion(row as PracticeQuestionRow);
  if (spec.type !== "counterexample") return { ok: false, reason: "unavailable" };
  let played;
  try {
    played = instantiate(spec);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if (played.answer !== 0 || !played.typeable) return { ok: false, reason: "unavailable" };
  if (played.typeable.x0 && x0 === null) return { ok: false, reason: "unreadable" };

  // The same function as an option: that option's verdict, no AI needed.
  const option = matchTypedCounterexample(played, typed, x0);
  if (option !== null) {
    const chosen = played.options[option];
    return { ok: true, verdict: VERDICT_BY_MARKER[chosen.marker ?? ""] ?? "invalid", reason: chosen.reason ?? "", by: "options" };
  }

  const requestHeaders = await headers();
  const ip = (requestHeaders.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!allowAiCheck(ip)) return { ok: false, reason: "cap" };
  if (viewer.kind === "student") {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await service
      .from("practice_ai_checks")
      .select("id", { count: "exact", head: true })
      .eq("student_id", viewer.studentId)
      .gte("created_at", since);
    if ((count ?? 0) >= AI_CHECKS_PER_DAY) return { ok: false, reason: "cap" };
  }

  const result = await judgeCounterexampleWithAI({
    claim: played.prompt,
    typed: expr,
    x0,
    options: played.options.map((item) => ({ text: item.text, marker: item.marker ?? "", reason: item.reason ?? null })),
    explanation: played.explanation,
  });
  if (!result) return { ok: false, reason: "unavailable" };

  await service.from("practice_ai_checks").insert({
    question_id: input.questionId,
    student_id: viewer.kind === "student" ? viewer.studentId : null,
    typed: x0 === null ? typed : `${typed} @ ${x0}`,
    verdict: result.verdict,
    reason: result.reason,
  });
  return { ok: true, verdict: result.verdict, reason: result.reason, by: "ai" };
}
