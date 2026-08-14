"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  CreateQuizInput,
  TeacherQuizListItem,
  QuizResults,
  QuizResultRow,
} from "@/lib/types/database";

export async function createQuizAction(
  data: CreateQuizInput,
): Promise<TeacherQuizListItem> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({
      teacher_id: user.id,
      class_id: data.classId,
      title: data.title,
      description: data.description || null,
    })
    .select("id, class_id, title, description, created_at")
    .single();

  if (quizError) {
    throw quizError;
  }

  for (const [index, question] of data.questions.entries()) {
    const { data: insertedQuestion, error: questionError } = await supabase
      .from("quiz_questions")
      .insert({
        quiz_id: quiz.id,
        question_text: question.questionText,
        question_type: question.questionType,
        order_index: index,
        points: question.points,
      })
      .select("id")
      .single();

    if (questionError) {
      throw questionError;
    }

    if (question.options.length > 0) {
      const { error: optionsError } = await supabase
        .from("quiz_question_options")
        .insert(
          question.options.map((option, optionIndex) => ({
            question_id: insertedQuestion.id,
            option_text: option.optionText,
            is_correct: option.isCorrect,
            order_index: optionIndex,
          })),
        );

      if (optionsError) {
        throw optionsError;
      }
    }
  }

  const { data: classRow } = await supabase
    .from("classes")
    .select("name")
    .eq("id", data.classId)
    .single();

  return {
    id: quiz.id,
    classId: quiz.class_id,
    className: classRow?.name ?? "",
    title: quiz.title,
    description: quiz.description,
    questionCount: data.questions.length,
    createdAt: quiz.created_at,
  };
}

export async function getQuizResultsAction(
  quizId: string,
): Promise<QuizResults> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title, class_id")
    .eq("id", quizId)
    .eq("teacher_id", user.id)
    .single();

  if (quizError || !quiz) {
    throw new Error("Quiz not found");
  }

  const { data: questions, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, points")
    .eq("quiz_id", quizId);

  if (questionsError) {
    throw questionsError;
  }

  const maxScore = (questions ?? []).reduce((sum, q) => sum + q.points, 0);

  const { data: assignments, error: assignmentsError } = await supabase
    .from("student_class_assignments")
    .select("student_id")
    .eq("class_id", quiz.class_id);

  if (assignmentsError) {
    throw assignmentsError;
  }

  const studentIds = (assignments ?? []).map(
    (assignment) => assignment.student_id,
  );

  // Fetched separately rather than embedded via a join - PostgREST's embed
  // cardinality inference isn't reliable enough here to trust silently; a
  // direct fetch-then-join in JS is what the rest of this feature already
  // does (see student-dashboard/quiz-actions.ts).
  const { data: students } =
    studentIds.length > 0
      ? await supabase
          .from("students")
          .select("id, first_name, last_name")
          .in("id", studentIds)
      : { data: [] as never[] };
  const studentById = new Map(
    (students ?? []).map((student) => [student.id, student]),
  );

  const { data: attempts, error: attemptsError } = await supabase
    .from("quiz_attempts")
    .select("id, student_id, score, submitted_at")
    .eq("quiz_id", quizId);

  if (attemptsError) {
    throw attemptsError;
  }

  const attemptByStudent = new Map(
    (attempts ?? []).map((attempt) => [attempt.student_id, attempt]),
  );

  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const pendingByAttempt = new Map<string, number>();

  if (attemptIds.length > 0) {
    const { data: pendingAnswers } = await supabase
      .from("quiz_attempt_answers")
      .select("attempt_id, text_answer, is_correct")
      .in("attempt_id", attemptIds);

    for (const answer of pendingAnswers ?? []) {
      if (answer.text_answer !== null && answer.is_correct === null) {
        pendingByAttempt.set(
          answer.attempt_id,
          (pendingByAttempt.get(answer.attempt_id) ?? 0) + 1,
        );
      }
    }
  }

  const results: QuizResultRow[] = (assignments ?? []).map((assignment) => {
    const student = studentById.get(assignment.student_id);
    const attempt = attemptByStudent.get(assignment.student_id);

    return {
      studentId: assignment.student_id,
      studentName: student
        ? `${student.first_name} ${student.last_name}`
        : "Unknown student",
      completed: Boolean(attempt),
      score: attempt?.score ?? null,
      maxScore,
      submittedAt: attempt?.submitted_at ?? null,
      pendingShortAnswerCount: attempt
        ? (pendingByAttempt.get(attempt.id) ?? 0)
        : 0,
    };
  });

  return {
    quizId: quiz.id,
    quizTitle: quiz.title,
    results,
  };
}
