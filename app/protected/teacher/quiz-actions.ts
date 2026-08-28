"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  copyQuizImage,
  deleteQuizImages,
  signQuizImageUrls,
} from "@/lib/quiz-images";
import type {
  CreateQuizInput,
  QuizForEditing,
  QuizQuestionInput,
  TeacherQuizListItem,
  QuizResults,
  QuizResultRow,
  QuizAttemptReview,
  QuizAttemptAnswerReview,
  QuizQuestionBreakdown,
  QuizQuestionBreakdownResult,
  QuizQuestionType,
  UpdateQuizInput,
  PendingGradingItem,
} from "@/lib/types/database";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireOwnedQuiz(
  supabase: SupabaseServerClient,
  quizId: string,
  teacherId: string,
) {
  const { data: quiz, error } = await supabase
    .from("quizzes")
    .select("id, title, description, time_limit_minutes, created_at")
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
        image_path: question.imagePath,
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

// The most generous max_attempts across every one of a student's classes
// this quiz is assigned to - null (unlimited) wins over any finite number,
// mirroring is_quiz_shuffled_for_student's permissive-OR resolution.
function resolveMaxAttempts(rows: { max_attempts: number | null }[]): number | null {
  if (rows.length === 0 || rows.some((row) => row.max_attempts === null)) {
    return null;
  }
  return Math.max(...rows.map((row) => row.max_attempts as number));
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
  quiz: {
    id: string;
    title: string;
    description: string | null;
    time_limit_minutes: number | null;
    created_at?: string;
  },
): Promise<TeacherQuizListItem> {
  const [{ data: assignments }, { count: questionCount }, attemptCount] =
    await Promise.all([
      supabase
        .from("quiz_assignments")
        .select(
          "class_id, shuffle_questions, max_attempts, classes:class_id (id, name)",
        )
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
    return {
      id: classRow?.id ?? assignment.class_id,
      name: classRow?.name ?? "",
      shuffleQuestions: assignment.shuffle_questions,
      maxAttempts: assignment.max_attempts,
    };
  });

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    timeLimitMinutes: quiz.time_limit_minutes,
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

  await requireTeacher(supabase, user.id);

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({
      teacher_id: user.id,
      title: data.title,
      description: data.description || null,
      time_limit_minutes: data.timeLimitMinutes ?? null,
    })
    .select("id, title, description, time_limit_minutes, created_at")
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

  await requireTeacher(supabase, user.id);

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

  await requireTeacher(supabase, user.id);

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

export async function setQuizAssignmentShuffleAction(
  quizId: string,
  classId: string,
  shuffleQuestions: boolean,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  await requireOwnedQuiz(supabase, quizId, user.id);

  const { error } = await supabase
    .from("quiz_assignments")
    .update({ shuffle_questions: shuffleQuestions })
    .eq("quiz_id", quizId)
    .eq("class_id", classId);

  if (error) {
    throw error;
  }
}

export async function setQuizAssignmentMaxAttemptsAction(
  quizId: string,
  classId: string,
  maxAttempts: number | null,
): Promise<void> {
  if (maxAttempts !== null && (!Number.isInteger(maxAttempts) || maxAttempts < 1)) {
    throw new ExpectedError("Max attempts must be a positive whole number, or unlimited.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  await requireOwnedQuiz(supabase, quizId, user.id);

  const { error } = await supabase
    .from("quiz_assignments")
    .update({ max_attempts: maxAttempts })
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

  await requireTeacher(supabase, user.id);

  const quiz = await requireOwnedQuiz(supabase, quizId, user.id);

  const [{ data: questionRows }, { data: assignments }, attemptCount] =
    await Promise.all([
      supabase
        .from("quiz_questions")
        .select("id, question_text, question_type, points, order_index, image_path")
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

  const imagePaths = (questionRows ?? [])
    .map((question) => question.image_path)
    .filter((path): path is string => typeof path === "string");
  const imageUrlByPath = await signQuizImageUrls(supabase, imagePaths);

  const questions: QuizQuestionInput[] = (questionRows ?? []).map(
    (question) => ({
      questionText: question.question_text,
      questionType: question.question_type as QuizQuestionType,
      points: question.points,
      options: (optionsByQuestion.get(question.id) ?? []).map((option) => ({
        optionText: option.option_text,
        isCorrect: option.is_correct,
      })),
      imagePath: question.image_path,
      imageUrl: question.image_path
        ? (imageUrlByPath.get(question.image_path) ?? null)
        : null,
    }),
  );

  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    timeLimitMinutes: quiz.time_limit_minutes,
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

  await requireTeacher(supabase, user.id);

  const quiz = await requireOwnedQuiz(supabase, data.quizId, user.id);

  const { data: updatedQuiz, error: updateError } = await supabase
    .from("quizzes")
    .update({
      title: data.title,
      description: data.description || null,
      time_limit_minutes: data.timeLimitMinutes ?? null,
    })
    .eq("id", quiz.id)
    .select("id, title, description, time_limit_minutes, created_at")
    .single();

  if (updateError) {
    throw updateError;
  }

  if (data.questions) {
    const attemptCount = await getQuizAttemptCount(supabase, quiz.id);
    if (attemptCount > 0) {
      throw new ExpectedError(
        "This quiz already has student submissions, so its questions can't be edited. Create a new quiz to change the content.",
      );
    }

    const { data: oldQuestionRows } = await supabase
      .from("quiz_questions")
      .select("image_path")
      .eq("quiz_id", quiz.id);

    const { error: deleteError } = await supabase
      .from("quiz_questions")
      .delete()
      .eq("quiz_id", quiz.id);

    if (deleteError) {
      throw deleteError;
    }

    await insertQuestions(supabase, quiz.id, data.questions);

    const oldImagePaths = (oldQuestionRows ?? [])
      .map((question) => question.image_path)
      .filter((path): path is string => typeof path === "string");
    const newImagePaths = new Set(
      data.questions
        .map((question) => question.imagePath)
        .filter((path): path is string => typeof path === "string"),
    );
    const staleImagePaths = oldImagePaths.filter(
      (path) => !newImagePaths.has(path),
    );
    if (staleImagePaths.length > 0) {
      await deleteQuizImages(supabase, staleImagePaths);
    }
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

  await requireTeacher(supabase, user.id);

  const source = await getQuizForEditingAction(quizId);

  const { data: newQuiz, error: quizError } = await supabase
    .from("quizzes")
    .insert({
      teacher_id: user.id,
      title: `${source.title} (copy)`,
      description: source.description,
      time_limit_minutes: source.timeLimitMinutes,
    })
    .select("id, title, description, time_limit_minutes, created_at")
    .single();

  if (quizError) {
    throw quizError;
  }

  // Each quiz's images must stay independent - reusing the source path
  // would let editing/deleting either quiz's image break the other.
  const copiedQuestions = await Promise.all(
    source.questions.map(async (question) => ({
      ...question,
      imagePath: question.imagePath
        ? await copyQuizImage(supabase, question.imagePath, user.id)
        : null,
    })),
  );

  await insertQuestions(supabase, newQuiz.id, copiedQuestions);

  return buildQuizListItem(supabase, newQuiz);
}

export async function deleteQuizAction(quizId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const quiz = await requireOwnedQuiz(supabase, quizId, user.id);

  const { data: questionRows } = await supabase
    .from("quiz_questions")
    .select("image_path")
    .eq("quiz_id", quiz.id);

  // No attempt-count guard - quiz_attempts.quiz_id is ON DELETE SET NULL
  // with quiz_title/max_score snapshotted at submission time, so a
  // student's history of taking this quiz survives the quiz itself being
  // deleted. Only the live questions/options/answer detail are lost.
  const { error } = await supabase.from("quizzes").delete().eq("id", quiz.id);

  if (error) {
    throw error;
  }

  const imagePaths = (questionRows ?? [])
    .map((question) => question.image_path)
    .filter((path): path is string => typeof path === "string");
  if (imagePaths.length > 0) {
    await deleteQuizImages(supabase, imagePaths);
  }
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

  await requireTeacher(supabase, user.id);

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

  const currentRosterIds = [
    ...new Set(
      (classAssignments ?? []).map((assignment) => assignment.student_id),
    ),
  ];

  const { data: attempts, error: attemptsError } = await supabase
    .from("quiz_attempts")
    .select("id, student_id, score, submitted_at")
    .eq("quiz_id", quizId);

  if (attemptsError) {
    throw attemptsError;
  }

  // Union of the current class roster (so a student who hasn't taken it
  // yet still shows as "not started") and everyone who has ever attempted
  // this quiz (so a past result doesn't silently disappear just because
  // the quiz was later reassigned to a different class) - matches
  // getQuizQuestionBreakdownAction's roster, which already gets this right.
  const studentIds = [
    ...new Set([
      ...currentRosterIds,
      ...(attempts ?? []).map((attempt) => attempt.student_id),
    ]),
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

  const attemptByStudent = new Map(
    (attempts ?? []).map((attempt) => [attempt.student_id, attempt]),
  );

  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const pendingByAttempt = new Map<string, number>();

  const { data: bestRows } =
    attemptIds.length > 0
      ? await supabase
          .from("quiz_attempt_bests")
          .select("attempt_id, score, attempts_used")
          .in("attempt_id", attemptIds)
      : { data: [] as { attempt_id: string; score: number; attempts_used: number }[] };
  const bestByAttempt = new Map(
    (bestRows ?? []).map((row) => [row.attempt_id, row]),
  );

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
    const best = attempt ? bestByAttempt.get(attempt.id) : undefined;

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
      bestScore: best?.score ?? attempt?.score ?? null,
      attemptsUsed: best?.attempts_used ?? (attempt ? 1 : 0),
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

  await requireTeacher(supabase, user.id);

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
      "id, question_id, selected_option_id, text_answer, is_correct, points_awarded, teacher_comment",
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
  const imagePaths = (questionRows ?? [])
    .map((question) => question.image_path)
    .filter((path): path is string => typeof path === "string");
  const imageUrlByPath = await signQuizImageUrls(supabase, imagePaths);
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

  function mapToReview(row: {
    id: string;
    question_id: string;
    selected_option_id: string | null;
    text_answer: string | null;
    is_correct: boolean | null;
    points_awarded: number | null;
    teacher_comment: string | null;
  }): QuizAttemptAnswerReview {
    const question = questionById.get(row.question_id);
    const correctOption = correctOptionByQuestion.get(row.question_id);
    const selectedOption = row.selected_option_id
      ? optionById.get(row.selected_option_id)
      : undefined;

    return {
      answerId: row.id,
      questionId: row.question_id,
      questionText: question?.question_text ?? "",
      questionType:
        (question?.question_type as QuizQuestionType) ?? "short_answer",
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
    };
  }

  const reviewAnswers: QuizAttemptAnswerReview[] = (answers ?? []).map(
    mapToReview,
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
      answers: (bestAnswerRows ?? []).map(mapToReview),
    };
  }

  const { data: studentClasses } = await supabase
    .from("student_class_assignments")
    .select("class_id")
    .eq("student_id", studentId);
  const classIds = (studentClasses ?? []).map((row) => row.class_id);

  const { data: assignmentRows } =
    classIds.length > 0
      ? await supabase
          .from("quiz_assignments")
          .select("max_attempts")
          .eq("quiz_id", quizId)
          .in("class_id", classIds)
      : { data: [] as { max_attempts: number | null }[] };

  const maxAttempts = resolveMaxAttempts(assignmentRows ?? []);
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

/**
 * Per-question view across every student who has attempted the quiz - the
 * complement to getQuizResultsAction, which is per-student across all
 * questions. Useful for spotting a question everyone missed or a common
 * wrong answer.
 */
export async function getQuizQuestionBreakdownAction(
  quizId: string,
): Promise<QuizQuestionBreakdownResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { data: quiz, error: quizError } = await supabase
    .from("quizzes")
    .select("id, title")
    .eq("id", quizId)
    .eq("teacher_id", user.id)
    .single();

  if (quizError || !quiz) {
    throw new Error("Quiz not found");
  }

  const { data: questionRows, error: questionsError } = await supabase
    .from("quiz_questions")
    .select("id, question_text, question_type, points, order_index, image_path")
    .eq("quiz_id", quizId)
    .order("order_index", { ascending: true });

  if (questionsError) {
    throw questionsError;
  }

  const questionIds = (questionRows ?? []).map((question) => question.id);
  const breakdownImagePaths = (questionRows ?? [])
    .map((question) => question.image_path)
    .filter((path): path is string => typeof path === "string");
  const breakdownImageUrlByPath = await signQuizImageUrls(
    supabase,
    breakdownImagePaths,
  );

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
    { id: string; option_text: string; is_correct: boolean }[]
  >();
  const optionById = new Map(
    (options ?? []).map((option) => [option.id, option]),
  );
  for (const option of options ?? []) {
    const list = optionsByQuestion.get(option.question_id) ?? [];
    list.push(option);
    optionsByQuestion.set(option.question_id, list);
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from("quiz_attempts")
    .select("id, student_id")
    .eq("quiz_id", quizId);

  if (attemptsError) {
    throw attemptsError;
  }

  const studentIds = [
    ...new Set((attempts ?? []).map((attempt) => attempt.student_id)),
  ];

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
  const studentIdByAttempt = new Map(
    (attempts ?? []).map((attempt) => [attempt.id, attempt.student_id]),
  );

  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  const { data: answers } =
    attemptIds.length > 0
      ? await supabase
          .from("quiz_attempt_answers")
          .select(
            "id, attempt_id, question_id, selected_option_id, text_answer, is_correct, teacher_comment",
          )
          .in("attempt_id", attemptIds)
      : { data: [] as never[] };

  const answersByQuestion = new Map<
    string,
    {
      id: string;
      attempt_id: string;
      selected_option_id: string | null;
      text_answer: string | null;
      is_correct: boolean | null;
      teacher_comment: string | null;
    }[]
  >();
  for (const answer of answers ?? []) {
    const list = answersByQuestion.get(answer.question_id) ?? [];
    list.push(answer);
    answersByQuestion.set(answer.question_id, list);
  }

  const questions: QuizQuestionBreakdown[] = (questionRows ?? []).map(
    (question) => {
      const questionOptions = optionsByQuestion.get(question.id) ?? [];
      const questionAnswers = answersByQuestion.get(question.id) ?? [];

      const optionBreakdown = questionOptions.map((option) => ({
        optionId: option.id,
        optionText: option.option_text,
        isCorrect: option.is_correct,
        count: questionAnswers.filter(
          (answer) => answer.selected_option_id === option.id,
        ).length,
      }));

      const studentAnswers = questionAnswers
        .map((answer) => {
          const studentId = studentIdByAttempt.get(answer.attempt_id);
          const student = studentId ? studentById.get(studentId) : undefined;
          const selectedOption = answer.selected_option_id
            ? optionById.get(answer.selected_option_id)
            : undefined;

          return {
            answerId: answer.id,
            studentId: studentId ?? "",
            studentName: student
              ? `${student.first_name} ${student.last_name}`
              : "Unknown student",
            selectedOptionText: selectedOption?.option_text ?? null,
            textAnswer: answer.text_answer,
            isCorrect: answer.is_correct,
            teacherComment: answer.teacher_comment,
          };
        })
        .sort((a, b) => a.studentName.localeCompare(b.studentName));

      return {
        questionId: question.id,
        questionText: question.question_text,
        questionType: question.question_type as QuizQuestionType,
        points: question.points,
        imageUrl: question.image_path
          ? (breakdownImageUrlByPath.get(question.image_path) ?? null)
          : null,
        optionBreakdown,
        studentAnswers,
      };
    },
  );

  return {
    quizId: quiz.id,
    quizTitle: quiz.title,
    questions,
  };
}

/**
 * Every short-answer response awaiting manual grading, across every quiz
 * assigned to this class - scoped to the class-detail view rather than a
 * specific quiz, since a teacher thinks about grading in terms of "this
 * class's pending work," not one quiz at a time.
 */
export async function getClassPendingGradingAction(
  classId: string,
): Promise<PendingGradingItem[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { data: classRow, error: classError } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", user.id)
    .single();

  if (classError || !classRow) {
    throw new Error("Class not found");
  }

  const { data: assignments } = await supabase
    .from("quiz_assignments")
    .select("quiz_id")
    .eq("class_id", classId);
  const quizIds = [
    ...new Set((assignments ?? []).map((assignment) => assignment.quiz_id)),
  ];

  const { data: rosterRows } = await supabase
    .from("student_class_assignments")
    .select("student_id")
    .eq("class_id", classId);
  const studentIds = [
    ...new Set((rosterRows ?? []).map((row) => row.student_id)),
  ];

  if (quizIds.length === 0 || studentIds.length === 0) {
    return [];
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id, student_id")
    .in("quiz_id", quizIds)
    .in("student_id", studentIds);

  if (attemptsError) {
    throw attemptsError;
  }

  const attemptIds = (attempts ?? []).map((attempt) => attempt.id);
  if (attemptIds.length === 0) {
    return [];
  }

  const { data: answers, error: answersError } = await supabase
    .from("quiz_attempt_answers")
    .select("id, attempt_id, question_id, text_answer, teacher_comment")
    .in("attempt_id", attemptIds)
    .is("is_correct", null)
    .not("text_answer", "is", null);

  if (answersError) {
    throw answersError;
  }

  if (!answers || answers.length === 0) {
    return [];
  }

  const attemptById = new Map((attempts ?? []).map((a) => [a.id, a]));
  const questionIds = [
    ...new Set(answers.map((answer) => answer.question_id)),
  ];
  const quizIdsInUse = [
    ...new Set((attempts ?? []).map((attempt) => attempt.quiz_id)),
  ];

  const [{ data: questions }, { data: quizzes }, { data: students }] =
    await Promise.all([
      supabase
        .from("quiz_questions")
        .select("id, question_text, points")
        .in("id", questionIds),
      supabase.from("quizzes").select("id, title").in("id", quizIdsInUse),
      supabase
        .from("students")
        .select("id, first_name, last_name")
        .in("id", studentIds),
    ]);

  const questionById = new Map((questions ?? []).map((q) => [q.id, q]));
  const quizById = new Map((quizzes ?? []).map((q) => [q.id, q]));
  const studentById = new Map((students ?? []).map((s) => [s.id, s]));

  return answers
    .map((answer) => {
      const attempt = attemptById.get(answer.attempt_id);
      const question = questionById.get(answer.question_id);
      const quiz = attempt ? quizById.get(attempt.quiz_id) : undefined;
      const student = attempt
        ? studentById.get(attempt.student_id)
        : undefined;

      return {
        answerId: answer.id,
        quizId: attempt?.quiz_id ?? "",
        quizTitle: quiz?.title ?? "",
        questionId: answer.question_id,
        questionText: question?.question_text ?? "",
        points: question?.points ?? 0,
        studentId: attempt?.student_id ?? "",
        studentName: student
          ? `${student.first_name} ${student.last_name}`
          : "Unknown student",
        textAnswer: answer.text_answer,
        teacherComment: answer.teacher_comment,
      };
    })
    .sort(
      (a, b) =>
        a.studentName.localeCompare(b.studentName) ||
        a.quizTitle.localeCompare(b.quizTitle),
    );
}

async function recomputeAttemptScore(
  supabase: SupabaseServerClient,
  attemptId: string,
) {
  const { data: rows } = await supabase
    .from("quiz_attempt_answers")
    .select("points_awarded")
    .eq("attempt_id", attemptId);

  const total = (rows ?? []).reduce(
    (sum, row) => sum + (row.points_awarded ?? 0),
    0,
  );

  await supabase
    .from("quiz_attempts")
    .update({ score: total })
    .eq("id", attemptId);
}

async function recomputeBestScore(
  supabase: SupabaseServerClient,
  attemptId: string,
) {
  const { data: rows } = await supabase
    .from("quiz_attempt_best_answers")
    .select("points_awarded")
    .eq("attempt_id", attemptId);

  const total = (rows ?? []).reduce(
    (sum, row) => sum + (row.points_awarded ?? 0),
    0,
  );

  await supabase
    .from("quiz_attempt_bests")
    .update({ score: total })
    .eq("attempt_id", attemptId);
}

/**
 * Manually grades a short-answer response - the only question type that
 * isn't auto-graded at submission (is_correct/points_awarded stay null
 * until a teacher does this). Recomputes and writes back the attempt's
 * total score so it's reflected everywhere score is read.
 */
export async function gradeShortAnswerAction(
  answerId: string,
  isCorrect: boolean,
  comment?: string | null,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const { data: answer, error: answerError } = await supabase
    .from("quiz_attempt_answers")
    .select("id, attempt_id, question_id, text_answer")
    .eq("id", answerId)
    .single();

  if (answerError || !answer) {
    throw new Error("Answer not found");
  }

  const { data: attempt, error: attemptError } = await supabase
    .from("quiz_attempts")
    .select("id, quiz_id")
    .eq("id", answer.attempt_id)
    .single();

  if (attemptError || !attempt) {
    throw new Error("Attempt not found");
  }

  // Ownership check, not just existence - requireOwnedQuiz throws unless
  // this quiz belongs to the calling teacher.
  await requireOwnedQuiz(supabase, attempt.quiz_id, user.id);

  const { data: question, error: questionError } = await supabase
    .from("quiz_questions")
    .select("points")
    .eq("id", answer.question_id)
    .single();

  if (questionError || !question) {
    throw new Error("Question not found");
  }

  const pointsAwarded = isCorrect ? question.points : 0;
  const trimmedComment = comment?.trim() || null;

  const { error: updateError } = await supabase
    .from("quiz_attempt_answers")
    .update({
      is_correct: isCorrect,
      points_awarded: pointsAwarded,
      ...(comment !== undefined ? { teacher_comment: trimmedComment } : {}),
    })
    .eq("id", answerId);

  if (updateError) {
    throw updateError;
  }

  await recomputeAttemptScore(supabase, attempt.id);

  // The "best" attempt is a separate snapshot that only sometimes matches
  // this one (quiz_attempts is always the first/official submission,
  // quiz_attempt_bests may hold a later retry's answers instead). Only
  // keep it in sync when its answer to this exact question is the same
  // submission (identical text) - a retry that answered differently needs
  // grading separately, not silently overwritten here.
  const { data: bestAnswer } = await supabase
    .from("quiz_attempt_best_answers")
    .select("id, text_answer")
    .eq("attempt_id", attempt.id)
    .eq("question_id", answer.question_id)
    .maybeSingle();

  if (bestAnswer && bestAnswer.text_answer === answer.text_answer) {
    const { error: bestUpdateError } = await supabase
      .from("quiz_attempt_best_answers")
      .update({
        is_correct: isCorrect,
        points_awarded: pointsAwarded,
        ...(comment !== undefined ? { teacher_comment: trimmedComment } : {}),
      })
      .eq("id", bestAnswer.id);

    if (bestUpdateError) {
      throw bestUpdateError;
    }

    await recomputeBestScore(supabase, attempt.id);
  }
}

/**
 * Adds, edits, or clears a teacher's free-text comment on one answer -
 * independent of grading, works for any question type, and doesn't touch
 * is_correct/points_awarded. `table` says which snapshot the row belongs
 * to: the official first-attempt answer (quiz_attempt_answers) or a later
 * retry's best-attempt answer (quiz_attempt_best_answers) - the two are
 * separate rows with their own ids, so the caller (which already knows
 * whether it's rendering QuizAttemptReview's `answers` or `best.answers`)
 * must say which one it's editing. No first/best sync here, unlike
 * gradeShortAnswerAction - a comment is tied to the specific row a teacher
 * was looking at, not something that needs to follow matching submissions.
 */
export async function setAnswerCommentAction(
  answerId: string,
  comment: string | null,
  table: "attempt" | "best" = "attempt",
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);

  const tableName =
    table === "best" ? "quiz_attempt_best_answers" : "quiz_attempt_answers";

  const { data: answer, error: answerError } = await supabase
    .from(tableName)
    .select("id, attempt_id")
    .eq("id", answerId)
    .single();

  if (answerError || !answer) {
    throw new Error("Answer not found");
  }

  // Both tables' attempt_id points at quiz_attempts.id (quiz_attempt_bests
  // uses that same id as its own primary key), so this ownership check
  // works the same regardless of which table we're editing.
  const { data: attempt, error: attemptError } = await supabase
    .from("quiz_attempts")
    .select("quiz_id")
    .eq("id", answer.attempt_id)
    .single();

  if (attemptError || !attempt) {
    throw new Error("Attempt not found");
  }

  await requireOwnedQuiz(supabase, attempt.quiz_id, user.id);

  const trimmedComment = comment?.trim() || null;

  const { error: updateError } = await supabase
    .from(tableName)
    .update({ teacher_comment: trimmedComment })
    .eq("id", answerId);

  if (updateError) {
    throw updateError;
  }
}
