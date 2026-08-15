"use server";

import { createClient } from "@/lib/supabase/server";
import type {
  CreateQuizInput,
  QuizForEditing,
  QuizQuestionInput,
  TeacherQuizListItem,
  QuizResults,
  QuizResultRow,
  QuizAttemptReview,
  QuizAttemptAnswerReview,
  QuizQuestionType,
  UpdateQuizInput,
} from "@/lib/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireOwnedQuiz(
  supabase: SupabaseServerClient,
  quizId: string,
  teacherId: string,
) {
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("id, title, description, created_at")
    .eq("id", quizId)
    .eq("teacher_id", teacherId)
    .single();

  if (error || !quiz) {
    throw new Error("Quiz not found");
  }

  return quiz;
}

async function insertQuestions(
  supabase: SupabaseServerClient,
  quizId: string,
  questions: QuizQuestionInput[],
) {
  for (const [index, question] of questions.entries()) {
    const { data: insertedQuestion, error: questionError } = await supabase
      .from("quiz_questions")
      .insert({
        quiz_id: quizId,
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
}

async function getQuizAttemptCount(
  supabase: SupabaseServerClient,
  quizId: string,
): Promise<number> {
  const { count } = await supabase
    .from("quiz_attempts")
    .select("id", { count: "exact", head: true })
    .eq("quiz_id", quizId);

  return count ?? 0;
}

async function buildQuizListItem(
  supabase: SupabaseServerClient,
  quiz: { id: string; title: string; description: string | null; created_at?: string },
): Promise<TeacherQuizListItem> {
  const [{ data: assignments }, { count: questionCount }, attemptCount] =
    await Promise.all([
      supabase
        .from("quiz_assignments")
        .select("class_id, classes:class_id (id, name)")
        .eq("quiz_id", quiz.id),
      supabase
        .from("quiz_questions")
        .select("id", { count: "exact", head: true })
        .eq("quiz_id", quiz.id),
      getQuizAttemptCount(supabase, quiz.id),
    ]);

  const assignedClasses = (assignments ?? []).map((assignment) => {
    const classRow = assignment.classes as unknown as {
      id: string;
      name: string;
    } | null;
    return { id: classRow?.id ?? assignment.class_id, name: classRow?.name ?? "" };
  });

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    assignedClasses,
    questionCount: questionCount ?? 0,
    hasAttempts: attemptCount > 0,
    createdAt: quiz.created_at,
  };
}

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
      title: data.title,
      description: data.description || null,
    })
    .select("id, title, description, created_at")
    .single();

  if (quizError) {
    throw quizError;
  }

  await insertQuestions(supabase, quiz.id, data.questions);

  if (data.classIds && data.classIds.length > 0) {
    const { error: assignError } = await supabase
      .from("quiz_assignments")
      .insert(
        data.classIds.map((classId) => ({
          quiz_id: quiz.id,
          class_id: classId,
        })),
      );

    if (assignError) {
      throw assignError;
    }
  }

  return buildQuizListItem(supabase, quiz);
}

export async function assignQuizToClassAction(
  quizId: string,
  classId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireOwnedQuiz(supabase, quizId, user.id);

  const { error } = await supabase
    .from("quiz_assignments")
    .upsert(
      { quiz_id: quizId, class_id: classId },
      { onConflict: "quiz_id,class_id", ignoreDuplicates: true },
    );

  if (error) {
    throw error;
  }
}

export async function unassignQuizFromClassAction(
  quizId: string,
  classId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireOwnedQuiz(supabase, quizId, user.id);

  const { error } = await supabase
    .from("quiz_assignments")
    .delete()
    .eq("quiz_id", quizId)
    .eq("class_id", classId);

  if (error) {
    throw error;
  }
}

export async function getQuizForEditingAction(
  quizId: string,
): Promise<QuizForEditing> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const quiz = await requireOwnedQuiz(supabase, quizId, user.id);

  const [{ data: questionRows }, { data: assignments }, attemptCount] =
    await Promise.all([
      supabase
        .from("quiz_questions")
        .select("id, question_text, question_type, points, order_index")
        .eq("quiz_id", quizId)
        .order("order_index", { ascending: true }),
      supabase
        .from("quiz_assignments")
        .select("class_id")
        .eq("quiz_id", quizId),
      getQuizAttemptCount(supabase, quizId),
    ]);

  const questionIds = (questionRows ?? []).map((question) => question.id);

  const { data: options } =
    questionIds.length > 0
      ? await supabase
          .from("quiz_question_options")
          .select("id, question_id, option_text, is_correct, order_index")
          .in("question_id", questionIds)
          .order("order_index", { ascending: true })
      : { data: [] as never[] };

  const optionsByQuestion = new Map<
    string,
    { option_text: string; is_correct: boolean }[]
  >();
  for (const option of options ?? []) {
    const list = optionsByQuestion.get(option.question_id) ?? [];
    list.push({ option_text: option.option_text, is_correct: option.is_correct });
    optionsByQuestion.set(option.question_id, list);
  }

  const questions: QuizQuestionInput[] = (questionRows ?? []).map(
    (question) => ({
      questionText: question.question_text,
      questionType: question.question_type as QuizQuestionType,
      points: question.points,
      options: (optionsByQuestion.get(question.id) ?? []).map((option) => ({
        optionText: option.option_text,
        isCorrect: option.is_correct,
      })),
    }),
  );

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    locked: attemptCount > 0,
    assignedClassIds: (assignments ?? []).map((a) => a.class_id),
    questions,
  };
}

export async function updateQuizAction(
  data: UpdateQuizInput,
): Promise<TeacherQuizListItem> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const quiz = await requireOwnedQuiz(supabase, data.quizId, user.id);

  const { data: updatedQuiz, error: updateError } = await supabase
    .from("quizzes")
    .update({
      title: data.title,
      description: data.description || null,
    })
    .eq("id", quiz.id)
    .select("id, title, description, created_at")
    .single();

  if (updateError) {
    throw updateError;
  }

  if (data.questions) {
    const attemptCount = await getQuizAttemptCount(supabase, quiz.id);
    if (attemptCount > 0) {
      throw new Error(
        "This quiz already has student submissions, so its questions can't be edited. Create a new quiz to change the content.",
      );
    }

    const { error: deleteError } = await supabase
      .from("quiz_questions")
      .delete()
      .eq("quiz_id", quiz.id);

    if (deleteError) {
      throw deleteError;
    }

    await insertQuestions(supabase, quiz.id, data.questions);
  }

  return buildQuizListItem(supabase, updatedQuiz);
}

export async function duplicateQuizAction(
  quizId: string,
): Promise<TeacherQuizListItem> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const source = await getQuizForEditingAction(quizId);

  const { data: newQuiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({
      teacher_id: user.id,
      title: `${source.title} (copy)`,
      description: source.description,
    })
    .select("id, title, description, created_at")
    .single();

  if (quizError) {
    throw quizError;
  }

  await insertQuestions(supabase, newQuiz.id, source.questions);

  return buildQuizListItem(supabase, newQuiz);
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
    .select("id, title")
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
    .from("quiz_assignments")
    .select("class_id")
    .eq("quiz_id", quizId);

  if (assignmentsError) {
    throw assignmentsError;
  }

  const assignedClassIds = [
    ...new Set((assignments ?? []).map((assignment) => assignment.class_id)),
  ];

  const { data: classAssignments, error: classAssignmentsError } =
    assignedClassIds.length > 0
      ? await supabase
          .from("student_class_assignments")
          .select("student_id")
          .in("class_id", assignedClassIds)
      : { data: [] as { student_id: string }[], error: null };

  if (classAssignmentsError) {
    throw classAssignmentsError;
  }

  const studentIds = [
    ...new Set(
      (classAssignments ?? []).map((assignment) => assignment.student_id),
    ),
  ];

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

  const results: QuizResultRow[] = studentIds.map((studentId) => {
    const student = studentById.get(studentId);
    const attempt = attemptByStudent.get(studentId);

    return {
      studentId,
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

/**
 * A specific student's answers for a quiz, for the teacher to review -
 * same shape as the student's own review (getQuizReviewAction), scoped by
 * teacher ownership of the quiz instead of the caller being that student.
 */
export async function getStudentQuizAttemptAction(
  quizId: string,
  studentId: string,
): Promise<QuizAttemptReview> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("id", quizId)
    .eq("teacher_id", user.id)
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
    throw new Error("No submission found for this student");
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

  const [{ data: questionRows }, { data: options }] = await Promise.all([
    questionIds.length > 0
      ? supabase
          .from("quiz_questions")
          .select("id, question_text, question_type, points")
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
          (question?.question_type as QuizQuestionType) ?? "short_answer",
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
