"use server";

import { createClient } from "@/lib/supabase/server";
import { signQuizImageUrls } from "@/lib/quiz-images";
import type {
  QuizForTaking,
  QuizQuestionForTaking,
  QuizAnswerInput,
  QuizAttemptReview,
  QuizAttemptAnswerReview,
} from "@/lib/types/database";

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
    throw new Error("You have already submitted this quiz");
  }

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title, description, time_limit_minutes")
    .eq("id", quizId)
    .single();

  if (quizError || !quiz) {
    throw new Error("Quiz not found");
  }

  let startedAt: string | null = null;
  if (quiz.time_limit_minutes !== null) {
    await supabase.from("quiz_attempt_starts").upsert(
      { quiz_id: quizId, student_id: studentId },
      { onConflict: "quiz_id,student_id", ignoreDuplicates: true },
    );

    const { data: startRow } = await supabase
      .from("quiz_attempt_starts")
      .select("started_at")
      .eq("quiz_id", quizId)
      .eq("student_id", studentId)
      .single();

    startedAt = startRow?.started_at ?? null;
  }

  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, question_text, question_type, order_index, points, image_path")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  if (questionsError) {
    throw questionsError;
  }

  const questionIds = (questions ?? []).map((question) => question.id);
  const takingImagePaths = (questions ?? [])
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

  const mappedQuestions: QuizQuestionForTaking[] = (questions ?? []).map(
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
    .select("id, question_text, question_type, points, image_path")
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
      });
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
    });
  }

  const maxScore = (questions ?? []).reduce(
    (sum, question) => sum + question.points,
    0,
  );

  // quiz_title/max_score are a snapshot, not a live join - if the quiz is
  // later deleted, this attempt (and the student's history of it) survives
  // via ON DELETE SET NULL, even though the questions/answer detail don't.
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

  const { error: answersError } = await supabase
    .from("quiz_attempt_answers")
    .insert(
      answerRows.map((row) => ({
        attempt_id: attempt.id,
        ...row,
      })),
    );

  if (answersError) {
    throw answersError;
  }

  // Tidy cleanup, not load-bearing - the quiz_attempts unique constraint
  // already prevents a second attempt regardless of this row's presence.
  await supabase
    .from("quiz_attempt_starts")
    .delete()
    .eq("quiz_id", quizId)
    .eq("student_id", studentId);

  return {
    attemptId: attempt.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    score: totalScore,
    maxScore,
    submittedAt: attempt.submitted_at,
    answers: reviewAnswers,
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
      "question_id, selected_option_id, text_answer, is_correct, points_awarded",
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
  const optionById = new Map(
    (options ?? []).map((option) => [option.id, option]),
  );
  const correctOptionByQuestion = new Map(
    (options ?? [])
      .filter((option) => option.is_correct)
      .map((option) => [option.question_id, option]),
  );

  const maxScore = (questionRows ?? []).reduce(
    (sum, question) => sum + question.points,
    0,
  );

  const reviewAnswers: QuizAttemptAnswerReview[] = (answers ?? []).map(
    (answer) => {
      const question = questionById.get(answer.question_id);
      const correctOption = correctOptionByQuestion.get(answer.question_id);
      const selectedOption = answer.selected_option_id
        ? optionById.get(answer.selected_option_id)
        : undefined;

      return {
        questionId: answer.question_id,
        questionText: question?.question_text ?? "",
        questionType:
          (question?.question_type as QuizQuestionForTaking["questionType"]) ??
          "short_answer",
        imageUrl: question?.image_path
          ? (reviewImageUrlByPath.get(question.image_path) ?? null)
          : null,
        selectedOptionId: answer.selected_option_id,
        selectedOptionText: selectedOption?.option_text ?? null,
        textAnswer: answer.text_answer,
        correctOptionId: correctOption?.id ?? null,
        correctOptionText: correctOption?.option_text ?? null,
        isCorrect: answer.is_correct,
        pointsAwarded: answer.points_awarded,
        pointsPossible: question?.points ?? 0,
      };
    },
  );

  return {
    attemptId: attempt.id,
    quizId: quiz.id,
    quizTitle: quiz.title,
    score: attempt.score,
    maxScore,
    submittedAt: attempt.submitted_at,
    answers: reviewAnswers,
  };
}
