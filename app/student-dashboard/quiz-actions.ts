"use server";

import { after } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { signQuizImageUrls } from "@/lib/quiz-images";
import { gradeShortAnswerWithAI } from "@/lib/ai-grading";
import { applyShortAnswerGrade } from "@/lib/quiz-grading";
import type {
  QuizForTaking,
  QuizQuestionForTaking,
  QuizAnswerInput,
  QuizAttemptReview,
  QuizAttemptAnswerReview,
} from "@/lib/types/database";

// One AI grading call per short-answer response with text, resolved once
// this submission knows which row id(s) that question's answer landed in
// (both official + best on a first attempt, best-only on an improving
// retry - see submitQuizAttemptAction).
interface AiGradingTask {
  attemptId: string;
  questionText: string;
  modelAnswer: string | null;
  textAnswer: string;
  points: number;
  attemptAnswerId?: string;
  bestAnswerId?: string;
}

/**
 * Grades every pending short answer from this submission and writes the
 * results with a service-role client - the student's own session has no
 * UPDATE policy on quiz_attempt_answers (only teachers can grade there),
 * and this runs via `after()` once the response has already been sent, so
 * there's no student-facing latency either way.
 */
async function runAiGradingPass(tasks: AiGradingTask[]): Promise<void> {
  if (tasks.length === 0) {
    return;
  }

  const supabase = createServiceRoleClient();

  await Promise.all(
    tasks.map(async (task) => {
      const result = await gradeShortAnswerWithAI({
        questionText: task.questionText,
        modelAnswer: task.modelAnswer,
        textAnswer: task.textAnswer,
        points: task.points,
      });

      if (!result) {
        return;
      }

      if (task.attemptAnswerId) {
        await applyShortAnswerGrade(supabase, {
          table: "quiz_attempt_answers",
          answerId: task.attemptAnswerId,
          attemptId: task.attemptId,
          isCorrect: result.isCorrect,
          pointsPossible: task.points,
          gradedBy: "ai",
          reasoning: result.reasoning,
        });
      }
      if (task.bestAnswerId) {
        await applyShortAnswerGrade(supabase, {
          table: "quiz_attempt_best_answers",
          answerId: task.bestAnswerId,
          attemptId: task.attemptId,
          isCorrect: result.isCorrect,
          pointsPossible: task.points,
          gradedBy: "ai",
        });
      }
    }),
  );
}

async function getStudentId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<string> {
  const { data: student, error } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (error || !student) {
    throw new Error("Student record not found");
  }

  return student.id;
}

function buildStoredAnswerReview(
  row: {
    id: string;
    question_id: string;
    selected_option_id: string | null;
    text_answer: string | null;
    is_correct: boolean | null;
    points_awarded: number | null;
    teacher_comment: string | null;
    // Absent on quiz_attempt_best_answers rows - this is reused for those
    // too, which never carry grading provenance.
    graded_by?: "teacher" | "ai" | null;
    ai_reasoning?: string | null;
  },
  questionById: Map<
    string,
    {
      question_text: string;
      question_type: string;
      points: number;
      image_path: string | null;
    }
  >,
  optionsByQuestion: Map<
    string,
    { id: string; question_id: string; option_text: string; is_correct: boolean }[]
  >,
  imageUrlByPath: Map<string, string>,
): QuizAttemptAnswerReview {
  const question = questionById.get(row.question_id);
  const questionOptions = optionsByQuestion.get(row.question_id) ?? [];
  const correctOption = questionOptions.find((option) => option.is_correct);
  const selectedOption = row.selected_option_id
    ? questionOptions.find((option) => option.id === row.selected_option_id)
    : undefined;

  return {
    answerId: row.id,
    questionId: row.question_id,
    questionText: question?.question_text ?? "",
    questionType:
      (question?.question_type as QuizQuestionForTaking["questionType"]) ??
      "short_answer",
    imageUrl: question?.image_path
      ? (imageUrlByPath.get(question.image_path) ?? null)
      : null,
    selectedOptionId: row.selected_option_id,
    selectedOptionText: selectedOption?.option_text ?? null,
    textAnswer: row.text_answer,
    correctOptionId: correctOption?.id ?? null,
    correctOptionText: correctOption?.option_text ?? null,
    isCorrect: row.is_correct,
    pointsAwarded: row.points_awarded,
    pointsPossible: question?.points ?? 0,
    teacherComment: row.teacher_comment,
    gradedBy: row.graded_by ?? null,
    aiReasoning: row.ai_reasoning ?? null,
  };
}

function shuffleQuestionOrder<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Fetches a quiz for a student to take. Deliberately never selects
 * is_correct from quiz_question_options - the answer key must not reach
 * the browser before submission.
 */
export async function getQuizForTakingAction(
  quizId: string,
): Promise<QuizForTaking> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const studentId = await getStudentId(supabase, user.id);

  const { data: existingAttempt } = await supabase
    .from("quiz_attempts")
    .select("id")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .maybeSingle();

  if (existingAttempt) {
    const { data: bestRow } = await supabase
      .from("quiz_attempt_bests")
      .select("attempts_used")
      .eq("attempt_id", existingAttempt.id)
      .single();

    const { data: maxAttempts } = await supabase.rpc(
      "quiz_max_attempts_for_student",
      { quiz_id_param: quizId },
    );

    const attemptsUsed = bestRow?.attempts_used ?? 1;
    if (maxAttempts !== null && attemptsUsed >= maxAttempts) {
      throw new Error("You have used all your attempts for this quiz");
    }
  }

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title, description, time_limit_minutes")
    .eq("id", quizId)
    .single();

  if (quizError || !quiz) {
    throw new Error("Quiz not found");
  }

  const { data: shuffleEnabled } = await supabase.rpc(
    "is_quiz_shuffled_for_student",
    { quiz_id_param: quizId },
  );

  // Anchor a quiz_attempt_starts row regardless of time_limit_minutes (not
  // just for timed quizzes) so a shuffled question order stays stable
  // across a resume/refresh.
  await supabase.from("quiz_attempt_starts").upsert(
    { quiz_id: quizId, student_id: studentId },
    { onConflict: "quiz_id,student_id", ignoreDuplicates: true },
  );

  const { data: startRow } = await supabase
    .from("quiz_attempt_starts")
    .select("started_at, question_order")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .single();

  const startedAt =
    quiz.time_limit_minutes !== null ? (startRow?.started_at ?? null) : null;

  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, question_text, question_type, order_index, points, image_path")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  if (questionsError) {
    throw questionsError;
  }

  let orderedQuestions = questions ?? [];
  if (shuffleEnabled) {
    const storedOrder = (startRow?.question_order as string[] | null) ?? null;
    const byId = new Map(
      orderedQuestions.map((question) => [question.id, question]),
    );
    const reordered = storedOrder
      ?.map((id) => byId.get(id))
      .filter((question): question is (typeof orderedQuestions)[number] =>
        question !== undefined,
      );

    if (reordered && reordered.length === orderedQuestions.length) {
      orderedQuestions = reordered;
    } else {
      orderedQuestions = shuffleQuestionOrder(orderedQuestions);
      await supabase
        .from("quiz_attempt_starts")
        .update({
          question_order: orderedQuestions.map((question) => question.id),
        })
        .eq("quiz_id", quizId)
        .eq("student_id", studentId);
    }
  }

  const questionIds = orderedQuestions.map((question) => question.id);
  const takingImagePaths = orderedQuestions
    .map((question) => question.image_path)
    .filter((path): path is string => typeof path === "string");
  const takingImageUrlByPath = await signQuizImageUrls(
    supabase,
    takingImagePaths,
  );
  const optionsByQuestion = new Map<
    string,
    { id: string; option_text: string; order_index: number }[]
  >();

  if (questionIds.length > 0) {
    const { data: options, error: optionsError } = await supabase
      .from("quiz_question_options")
      .select("id, question_id, option_text, order_index")
      .in("question_id", questionIds)
      .order("order_index", { ascending: true });

    if (optionsError) {
      throw optionsError;
    }

    for (const option of options ?? []) {
      const list = optionsByQuestion.get(option.question_id) ?? [];
      list.push(option);
      optionsByQuestion.set(option.question_id, list);
    }
  }

  const mappedQuestions: QuizQuestionForTaking[] = orderedQuestions.map(
    (question) => ({
      id: question.id,
      questionText: question.question_text,
      questionType: question.question_type as QuizQuestionForTaking["questionType"],
      orderIndex: question.order_index,
      points: question.points,
      imageUrl: question.image_path
        ? (takingImageUrlByPath.get(question.image_path) ?? null)
        : null,
      options: (optionsByQuestion.get(question.id) ?? []).map((option) => ({
        id: option.id,
        optionText: option.option_text,
        orderIndex: option.order_index,
      })),
    }),
  );

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    timeLimitMinutes: quiz.time_limit_minutes,
    startedAt,
    questions: mappedQuestions,
  };
}

/**
 * Grades and records a quiz attempt. The answer key is fetched here,
 * server-side, and compared against the submission - a client can never
 * claim "this answer was correct" and have it trusted.
 */
export async function submitQuizAttemptAction(
  quizId: string,
  answers: QuizAnswerInput[],
): Promise<QuizAttemptReview> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const studentId = await getStudentId(supabase, user.id);

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("id", quizId)
    .single();

  if (quizError || !quiz) {
    throw new Error("Quiz not found");
  }

  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, question_text, question_type, points, image_path, model_answer")
    .eq("quiz_id", quizId);

  if (questionsError) {
    throw questionsError;
  }

  const questionIds = (questions ?? []).map((question) => question.id);
  const submitImagePaths = (questions ?? [])
    .map((question) => question.image_path)
    .filter((path): path is string => typeof path === "string");
  const submitImageUrlByPath = await signQuizImageUrls(
    supabase,
    submitImagePaths,
  );
  const { data: options, error: optionsError } = await supabase
    .from("quiz_question_options")
    .select("id, question_id, option_text, is_correct")
    .in("question_id", questionIds);

  if (optionsError) {
    throw optionsError;
  }

  const optionsByQuestion = new Map<
    string,
    { id: string; question_id: string; option_text: string; is_correct: boolean }[]
  >();
  for (const option of options ?? []) {
    const list = optionsByQuestion.get(option.question_id) ?? [];
    list.push(option);
    optionsByQuestion.set(option.question_id, list);
  }

  const answerByQuestion = new Map(
    answers.map((answer) => [answer.questionId, answer]),
  );

  let totalScore = 0;
  const answerRows: {
    question_id: string;
    selected_option_id: string | null;
    text_answer: string | null;
    is_correct: boolean | null;
    points_awarded: number | null;
  }[] = [];
  const reviewAnswers: QuizAttemptAnswerReview[] = [];
  // Populated per short-answer question below, resolved to row ids once
  // this submission's inserts complete, then handed to runAiGradingPass.
  const pendingAiGrading: {
    questionId: string;
    questionText: string;
    modelAnswer: string | null;
    textAnswer: string;
    points: number;
  }[] = [];

  for (const question of questions ?? []) {
    const submitted = answerByQuestion.get(question.id);
    const questionOptions = optionsByQuestion.get(question.id) ?? [];
    const correctOption = questionOptions.find((option) => option.is_correct);
    const questionImageUrl = question.image_path
      ? (submitImageUrlByPath.get(question.image_path) ?? null)
      : null;

    if (question.question_type === "short_answer") {
      answerRows.push({
        question_id: question.id,
        selected_option_id: null,
        text_answer: submitted?.textAnswer ?? null,
        is_correct: null,
        points_awarded: null,
      });
      reviewAnswers.push({
        // Overwritten once the row is actually inserted below - this
        // in-memory snapshot has no id yet.
        answerId: "",
        questionId: question.id,
        questionText: question.question_text,
        questionType: "short_answer",
        imageUrl: questionImageUrl,
        selectedOptionId: null,
        selectedOptionText: null,
        textAnswer: submitted?.textAnswer ?? null,
        correctOptionId: null,
        correctOptionText: null,
        isCorrect: null,
        pointsAwarded: null,
        pointsPossible: question.points,
        teacherComment: null,
        gradedBy: null,
        aiReasoning: null,
      });
      const trimmedTextAnswer = submitted?.textAnswer?.trim();
      if (trimmedTextAnswer) {
        pendingAiGrading.push({
          questionId: question.id,
          questionText: question.question_text,
          modelAnswer: question.model_answer,
          textAnswer: trimmedTextAnswer,
          points: question.points,
        });
      }
      continue;
    }

    const selectedOptionId = submitted?.selectedOptionId ?? null;
    const selectedOption = questionOptions.find(
      (option) => option.id === selectedOptionId,
    );
    const isCorrect =
      selectedOptionId !== null && selectedOptionId === correctOption?.id;
    const pointsAwarded = isCorrect ? question.points : 0;
    totalScore += pointsAwarded;

    answerRows.push({
      question_id: question.id,
      selected_option_id: selectedOptionId,
      text_answer: null,
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
    });
    reviewAnswers.push({
      // Overwritten once the row is actually inserted below - this
      // in-memory snapshot has no id yet.
      answerId: "",
      questionId: question.id,
      questionText: question.question_text,
      questionType:
        question.question_type as QuizQuestionForTaking["questionType"],
      imageUrl: questionImageUrl,
      selectedOptionId,
      selectedOptionText: selectedOption?.option_text ?? null,
      textAnswer: null,
      correctOptionId: correctOption?.id ?? null,
      correctOptionText: correctOption?.option_text ?? null,
      isCorrect,
      pointsAwarded,
      pointsPossible: question.points,
      teacherComment: null,
      gradedBy: null,
      aiReasoning: null,
    });
  }

  const maxScore = (questions ?? []).reduce(
    (sum, question) => sum + question.points,
    0,
  );
  const questionById = new Map((questions ?? []).map((q) => [q.id, q]));

  const { data: existingAttempt } = await supabase
    .from("quiz_attempts")
    .select("id, submitted_at, score")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .maybeSingle();

  const { data: maxAttempts } = await supabase.rpc(
    "quiz_max_attempts_for_student",
    { quiz_id_param: quizId },
  );

  let attemptId: string;
  let officialScore: number;
  let officialSubmittedAt: string;
  let bestScore: number;
  let bestSubmittedAt: string;
  let bestAnswers: QuizAttemptAnswerReview[];
  let attemptsUsed: number;
  // Populated by whichever branch below actually wrote short-answer rows,
  // so the AI-grading pass after the if/else knows which id(s) to write
  // its verdict to for each question.
  let attemptAnswerIdByQuestion = new Map<string, string>();
  let bestAnswerIdByQuestion = new Map<string, string>();
  // A retry's short answers whose grading was resolved synchronously
  // below (only happens when the retry-vs-best comparison is otherwise
  // ambiguous) - excluded from the async after() pass at the end since
  // they're already graded.
  const resolvedGrades = new Map<
    string,
    { isCorrect: boolean; reasoning: string }
  >();

  if (!existingAttempt) {
    // First attempt - this row becomes the permanent "official" record and
    // is never touched again. quiz_title/max_score are a snapshot, not a
    // live join - if the quiz is later deleted, this attempt (and the
    // student's history of it) survives via ON DELETE SET NULL, even
    // though the questions/answer detail don't.
    const { data: attempt, error: attemptError } = await supabase
      .from("quiz_attempts")
      .insert({
        quiz_id: quizId,
        student_id: studentId,
        score: totalScore,
        quiz_title: quiz.title,
        max_score: maxScore,
      })
      .select("id, submitted_at")
      .single();

    if (attemptError) {
      throw attemptError;
    }

    attemptId = attempt.id;
    officialScore = totalScore;
    officialSubmittedAt = attempt.submitted_at;

    const { data: insertedAnswers, error: answersError } = await supabase
      .from("quiz_attempt_answers")
      .insert(answerRows.map((row) => ({ attempt_id: attemptId, ...row })))
      .select("id, question_id");

    if (answersError) {
      throw answersError;
    }

    const insertedAnswerIdByQuestion = new Map(
      (insertedAnswers ?? []).map((row) => [row.question_id, row.id]),
    );
    attemptAnswerIdByQuestion = insertedAnswerIdByQuestion;
    for (const review of reviewAnswers) {
      review.answerId =
        insertedAnswerIdByQuestion.get(review.questionId) ?? "";
    }

    const { data: bestRow, error: bestError } = await supabase
      .from("quiz_attempt_bests")
      .insert({
        attempt_id: attemptId,
        score: totalScore,
        submitted_at: attempt.submitted_at,
        attempts_used: 1,
      })
      .select("score, submitted_at, attempts_used")
      .single();

    if (bestError) {
      throw bestError;
    }

    const { data: insertedBestAnswers, error: bestAnswersError } =
      await supabase
        .from("quiz_attempt_best_answers")
        .insert(answerRows.map((row) => ({ attempt_id: attemptId, ...row })))
        .select("id, question_id");

    if (bestAnswersError) {
      throw bestAnswersError;
    }

    bestAnswerIdByQuestion = new Map(
      (insertedBestAnswers ?? []).map((row) => [row.question_id, row.id]),
    );

    bestScore = bestRow.score;
    bestSubmittedAt = bestRow.submitted_at;
    bestAnswers = reviewAnswers;
    attemptsUsed = bestRow.attempts_used;
  } else {
    // Retry - quiz_attempts (the official/first attempt) is never touched
    // again. Only replace the best row (score + full answer detail) if
    // this retry beats it; a worse retry's answers are discarded
    // entirely, never written anywhere - matching the product decision to
    // persist only the first and best results, never every retry.
    attemptId = existingAttempt.id;
    officialScore = existingAttempt.score;
    officialSubmittedAt = existingAttempt.submitted_at;

    const { data: currentBest, error: currentBestError } = await supabase
      .from("quiz_attempt_bests")
      .select("score, attempts_used")
      .eq("attempt_id", attemptId)
      .single();

    if (currentBestError || !currentBest) {
      throw currentBestError ?? new Error("No prior attempt found to retry");
    }

    if (maxAttempts !== null && currentBest.attempts_used >= maxAttempts) {
      throw new Error("You have used all your attempts for this quiz");
    }

    // A retry's short answers aren't counted in totalScore yet, so whether
    // it beats the current best can hinge entirely on them. Resolve them
    // synchronously here - but only when the comparison is genuinely
    // ambiguous (totalScore alone doesn't already decide it either way) -
    // so a clean win/loss never pays for an AI call it doesn't need.
    const optimisticScore =
      totalScore + pendingAiGrading.reduce((sum, task) => sum + task.points, 0);
    let resolvedScore = totalScore;
    if (
      pendingAiGrading.length > 0 &&
      totalScore <= currentBest.score &&
      optimisticScore > currentBest.score
    ) {
      const resolutions = await Promise.all(
        pendingAiGrading.map(async (task) => ({
          task,
          result: await gradeShortAnswerWithAI({
            questionText: task.questionText,
            modelAnswer: task.modelAnswer,
            textAnswer: task.textAnswer,
            points: task.points,
          }),
        })),
      );
      for (const { task, result } of resolutions) {
        if (!result) continue;
        resolvedGrades.set(task.questionId, result);
        resolvedScore += result.isCorrect ? task.points : 0;
      }
    }

    const improves = resolvedScore > currentBest.score;

    const { data: updatedBest, error: updateBestError } = await supabase
      .from("quiz_attempt_bests")
      .update({
        attempts_used: currentBest.attempts_used + 1,
        ...(improves
          ? { score: resolvedScore, submitted_at: new Date().toISOString() }
          : {}),
      })
      .eq("attempt_id", attemptId)
      .select("score, submitted_at, attempts_used")
      .single();

    if (updateBestError) {
      throw updateBestError;
    }

    if (improves) {
      const { error: deleteBestAnswersError } = await supabase
        .from("quiz_attempt_best_answers")
        .delete()
        .eq("attempt_id", attemptId);

      if (deleteBestAnswersError) {
        throw deleteBestAnswersError;
      }

      // Any short answer resolved above goes in already graded - no need
      // to wait for the async pass to grade it a second time.
      const bestAnswerRowsToInsert = answerRows.map((row) => {
        const resolved = resolvedGrades.get(row.question_id);
        if (!resolved) return row;
        const task = pendingAiGrading.find(
          (t) => t.questionId === row.question_id,
        );
        return {
          ...row,
          is_correct: resolved.isCorrect,
          points_awarded: resolved.isCorrect ? (task?.points ?? 0) : 0,
        };
      });

      const { data: insertedBestAnswers, error: insertBestAnswersError } =
        await supabase
          .from("quiz_attempt_best_answers")
          .insert(
            bestAnswerRowsToInsert.map((row) => ({
              attempt_id: attemptId,
              ...row,
            })),
          )
          .select("id, question_id");

      if (insertBestAnswersError) {
        throw insertBestAnswersError;
      }

      const insertedBestAnswerIdByQuestion = new Map(
        (insertedBestAnswers ?? []).map((row) => [row.question_id, row.id]),
      );
      bestAnswerIdByQuestion = insertedBestAnswerIdByQuestion;
      for (const review of reviewAnswers) {
        review.answerId =
          insertedBestAnswerIdByQuestion.get(review.questionId) ?? "";
        const resolved = resolvedGrades.get(review.questionId);
        if (resolved) {
          review.isCorrect = resolved.isCorrect;
          review.pointsAwarded = resolved.isCorrect
            ? review.pointsPossible
            : 0;
        }
      }

      bestAnswers = reviewAnswers;
    } else {
      const { data: storedBestAnswers } = await supabase
        .from("quiz_attempt_best_answers")
        .select(
          "id, question_id, selected_option_id, text_answer, is_correct, points_awarded, teacher_comment",
        )
        .eq("attempt_id", attemptId);

      bestAnswers = (storedBestAnswers ?? []).map((row) =>
        buildStoredAnswerReview(
          row,
          questionById,
          optionsByQuestion,
          submitImageUrlByPath,
        ),
      );
    }

    bestScore = updatedBest.score;
    bestSubmittedAt = updatedBest.submitted_at;
    attemptsUsed = updatedBest.attempts_used;
  }

  // The just-graded reviewAnswers are this submission's own answers - for
  // a first attempt that IS the official record, but for a retry the
  // top-level "official" answers must instead be re-fetched from the
  // untouched quiz_attempt_answers row written back on the first attempt.
  let officialAnswers = reviewAnswers;
  if (existingAttempt) {
    const { data: officialAnswerRows } = await supabase
      .from("quiz_attempt_answers")
      .select(
        "id, question_id, selected_option_id, text_answer, is_correct, points_awarded, teacher_comment, graded_by, ai_reasoning",
      )
      .eq("attempt_id", attemptId);

    officialAnswers = (officialAnswerRows ?? []).map((row) =>
      buildStoredAnswerReview(
        row,
        questionById,
        optionsByQuestion,
        submitImageUrlByPath,
      ),
    );
  }

  // Tidy cleanup, not load-bearing - the next getQuizForTakingAction call
  // re-upserts a fresh row (fresh timer, fresh shuffle order) regardless.
  await supabase
    .from("quiz_attempt_starts")
    .delete()
    .eq("quiz_id", quizId)
    .eq("student_id", studentId);

  // Runs after this response is already on its way back to the student -
  // AI grading never adds latency to a quiz submission. A retry that
  // didn't improve wrote nothing above, so there's nothing to grade for it.
  // Questions already resolved synchronously above (the ambiguous-retry
  // case) are excluded - grading them again would just waste a call.
  const aiGradingTasks: AiGradingTask[] = pendingAiGrading
    .filter((task) => !resolvedGrades.has(task.questionId))
    .map((task) => ({
      attemptId,
      questionText: task.questionText,
      modelAnswer: task.modelAnswer,
      textAnswer: task.textAnswer,
      points: task.points,
      attemptAnswerId: attemptAnswerIdByQuestion.get(task.questionId),
      bestAnswerId: bestAnswerIdByQuestion.get(task.questionId),
    }))
    .filter((task) => task.attemptAnswerId || task.bestAnswerId);
  if (aiGradingTasks.length > 0) {
    after(() => runAiGradingPass(aiGradingTasks));
  }

  return {
    attemptId,
    quizId: quiz.id,
    quizTitle: quiz.title,
    score: officialScore,
    maxScore,
    submittedAt: officialSubmittedAt,
    answers: officialAnswers,
    attemptsUsed,
    maxAttempts,
    canRetake: maxAttempts === null || attemptsUsed < maxAttempts,
    best:
      attemptsUsed > 1
        ? { score: bestScore, submittedAt: bestSubmittedAt, answers: bestAnswers }
        : null,
  };
}

/**
 * Re-fetches a previously submitted attempt's review (correct answers
 * included - this only ever returns the student's own, already-scored
 * attempt, never an answer key ahead of submission).
 */
export async function getQuizReviewAction(
  quizId: string,
): Promise<QuizAttemptReview> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const studentId = await getStudentId(supabase, user.id);

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("id", quizId)
    .single();

  if (quizError || !quiz) {
    throw new Error("Quiz not found");
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("quiz_attempts")
    .select("id, score, submitted_at")
    .eq("quiz_id", quizId)
    .eq("student_id", studentId)
    .single();

  if (attemptError || !attempt) {
    throw new Error("No submission found for this quiz");
  }

  const { data: answers, error: answersError } = await supabase
    .from("quiz_attempt_answers")
    .select(
      "id, question_id, selected_option_id, text_answer, is_correct, points_awarded, teacher_comment, graded_by, ai_reasoning",
    )
    .eq("attempt_id", attempt.id);

  if (answersError) {
    throw answersError;
  }

  const questionIds = (answers ?? []).map((answer) => answer.question_id);

  // Fetched separately rather than embedded via a join - keeps this
  // consistent with getQuizForTakingAction/submitQuizAttemptAction, which
  // both fetch quiz_questions directly rather than relying on PostgREST's
  // embed cardinality inference.
  const [{ data: questionRows }, { data: options }] = await Promise.all([
    questionIds.length > 0
      ? supabase
          .from("quiz_questions")
          .select("id, question_text, question_type, points, image_path")
          .in("id", questionIds)
      : Promise.resolve({ data: [] as never[] }),
    questionIds.length > 0
      ? supabase
          .from("quiz_question_options")
          .select("id, question_id, option_text, is_correct")
          .in("question_id", questionIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const questionById = new Map(
    (questionRows ?? []).map((question) => [question.id, question]),
  );
  const reviewImagePaths = (questionRows ?? [])
    .map((question) => question.image_path)
    .filter((path): path is string => typeof path === "string");
  const reviewImageUrlByPath = await signQuizImageUrls(
    supabase,
    reviewImagePaths,
  );

  const maxScore = (questionRows ?? []).reduce(
    (sum, question) => sum + question.points,
    0,
  );

  const optionsByQuestion = new Map<
    string,
    { id: string; question_id: string; option_text: string; is_correct: boolean }[]
  >();
  for (const option of options ?? []) {
    const list = optionsByQuestion.get(option.question_id) ?? [];
    list.push(option);
    optionsByQuestion.set(option.question_id, list);
  }

  const reviewAnswers: QuizAttemptAnswerReview[] = (answers ?? []).map(
    (answer) =>
      buildStoredAnswerReview(
        answer,
        questionById,
        optionsByQuestion,
        reviewImageUrlByPath,
      ),
  );

  const { data: bestRow } = await supabase
    .from("quiz_attempt_bests")
    .select("score, submitted_at, attempts_used")
    .eq("attempt_id", attempt.id)
    .single();

  let best: QuizAttemptReview["best"] = null;
  if (bestRow && bestRow.attempts_used > 1) {
    const { data: bestAnswerRows } = await supabase
      .from("quiz_attempt_best_answers")
      .select(
        "id, question_id, selected_option_id, text_answer, is_correct, points_awarded, teacher_comment",
      )
      .eq("attempt_id", attempt.id);

    best = {
      score: bestRow.score,
      submittedAt: bestRow.submitted_at,
      answers: (bestAnswerRows ?? []).map((row) =>
        buildStoredAnswerReview(
          row,
          questionById,
          optionsByQuestion,
          reviewImageUrlByPath,
        ),
      ),
    };
  }

  const { data: maxAttempts } = await supabase.rpc(
    "quiz_max_attempts_for_student",
    { quiz_id_param: quizId },
  );
  const attemptsUsed = bestRow?.attempts_used ?? 1;

  return {
    attemptId: attempt.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    score: attempt.score,
    maxScore,
    submittedAt: attempt.submitted_at,
    answers: reviewAnswers,
    attemptsUsed,
    maxAttempts,
    canRetake: maxAttempts === null || attemptsUsed < maxAttempts,
    best,
  };
}
