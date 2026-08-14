"use server";

import { createClient } from "@/lib/supabase/server";
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
    .select("id, title, description")
    .eq("id", quizId)
    .single();

  if (quizError || !quiz) {
    throw new Error("Quiz not found");
  }

  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, question_text, question_type, order_index, points")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  if (questionsError) {
    throw questionsError;
  }

  const questionIds = (questions ?? []).map((question) => question.id);
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
    .select("id, question_text, question_type, points")
    .eq("quiz_id", quizId);

  if (questionsError) {
    throw questionsError;
  }

  const questionIds = (questions ?? []).map((question) => question.id);
  const { data: options, error: optionsError } = await supabase
    .from("quiz_question_options")
    .select("id, question_id, is_correct")
    .in("question_id", questionIds);

  if (optionsError) {
    throw optionsError;
  }

  const optionsByQuestion = new Map<
    string,
    { id: string; question_id: string; is_correct: boolean }[]
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
        selectedOptionId: null,
        textAnswer: submitted?.textAnswer ?? null,
        correctOptionId: null,
        isCorrect: null,
        pointsAwarded: null,
        pointsPossible: question.points,
      });
      continue;
    }

    const selectedOptionId = submitted?.selectedOptionId ?? null;
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
      selectedOptionId,
      textAnswer: null,
      correctOptionId: correctOption?.id ?? null,
      isCorrect,
      pointsAwarded,
      pointsPossible: question.points,
    });
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("quiz_attempts")
    .insert({
      quiz_id: quizId,
      student_id: studentId,
      score: totalScore,
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

  const maxScore = (questions ?? []).reduce(
    (sum, question) => sum + question.points,
    0,
  );

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
      "question_id, selected_option_id, text_answer, is_correct, points_awarded, quiz_questions:question_id (question_text, question_type, points)",
    )
    .eq("attempt_id", attempt.id);

  if (answersError) {
    throw answersError;
  }

  const questionIds = (answers ?? []).map((answer) => answer.question_id);
  const { data: options } = await supabase
    .from("quiz_question_options")
    .select("id, question_id, is_correct")
    .in("question_id", questionIds);

  const correctOptionByQuestion = new Map(
    (options ?? [])
      .filter((option) => option.is_correct)
      .map((option) => [option.question_id, option.id]),
  );

  const maxScore = (answers ?? []).reduce((sum, answer) => {
    const question = answer.quiz_questions as unknown as { points: number };
    return sum + question.points;
  }, 0);

  const reviewAnswers: QuizAttemptAnswerReview[] = (answers ?? []).map(
    (answer) => {
      const question = answer.quiz_questions as unknown as {
        question_text: string;
        question_type: QuizQuestionForTaking["questionType"];
        points: number;
      };

      return {
        questionId: answer.question_id,
        questionText: question.question_text,
        questionType: question.question_type,
        selectedOptionId: answer.selected_option_id,
        textAnswer: answer.text_answer,
        correctOptionId: correctOptionByQuestion.get(answer.question_id) ?? null,
        isCorrect: answer.is_correct,
        pointsAwarded: answer.points_awarded,
        pointsPossible: question.points,
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
