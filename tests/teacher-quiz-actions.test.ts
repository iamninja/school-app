import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { gradeShortAnswerWithAI } from "@/lib/ai-grading";
import {
  assignQuizToClassAction,
  createQuizAction,
  deleteQuizAction,
  getClassPendingGradingAction,
  getQuizResultsAction,
  gradeShortAnswerAction,
  regradeShortAnswerWithAiAction,
  updateQuizAction,
} from "@/app/protected/teacher/quiz-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

vi.mock("@/lib/ai-grading", () => ({
  gradeShortAnswerWithAI: vi.fn(),
}));

const quizRow = {
  id: "quiz-1",
  title: "Chapter 3",
  description: null,
  time_limit_minutes: null,
  created_at: "2026-08-16T00:00:00Z",
};

function findChain(
  client: ReturnType<typeof createMockSupabaseClient>,
  table: string,
) {
  const index = client.from.mock.calls.findIndex(([t]) => t === table);
  if (index === -1) {
    throw new Error(`"${table}" was never queried`);
  }
  return client.from.mock.results[index].value;
}

describe("teacher quiz actions - updateQuizAction", () => {
  it("throws ExpectedError when the quiz already has attempts and questions were provided", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        quizzes: [
          { data: quizRow, error: null }, // requireOwnedQuiz
          { data: quizRow, error: null }, // update + select
        ],
        quiz_attempts: { data: null, error: null, count: 3 }, // lock check
      }) as never,
    );

    await expect(
      updateQuizAction({
        quizId: "quiz-1",
        title: "Chapter 3",
        questions: [
          {
            questionText: "2+2?",
            questionType: "short_answer",
            points: 1,
            options: [],
            imagePath: null,
          },
        ],
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("replaces questions when the quiz has no attempts yet", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    const client = createMockSupabaseClient({
      quizzes: [
        { data: quizRow, error: null }, // requireOwnedQuiz
        { data: quizRow, error: null }, // update + select
      ],
      quiz_attempts: [
        { data: null, error: null, count: 0 }, // lock check
        { data: null, error: null, count: 0 }, // buildQuizListItem
      ],
      quiz_questions: [
        { data: [], error: null }, // select old image_paths
        { data: null, error: null }, // delete existing
        { data: { id: "question-1" }, error: null }, // insert replacement
        { data: null, error: null, count: 1 }, // buildQuizListItem count
      ],
      quiz_assignments: { data: [], error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await updateQuizAction({
      quizId: "quiz-1",
      title: "Chapter 3",
      questions: [
        {
          questionText: "2+2?",
          questionType: "short_answer",
          points: 1,
          options: [],
          imagePath: null,
        },
      ],
    });

    expect(result.questionCount).toBe(1);
    expect(result.hasAttempts).toBe(false);
  });

  it("skips the attempt-count/lock check entirely when questions aren't provided", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    const client = createMockSupabaseClient({
      quizzes: [
        { data: quizRow, error: null },
        { data: quizRow, error: null },
      ],
      quiz_attempts: { data: null, error: null, count: 2 },
      quiz_questions: { data: null, error: null, count: 0 },
      quiz_assignments: { data: [], error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await updateQuizAction({
      quizId: "quiz-1",
      title: "Renamed title only",
    });

    expect(result.hasAttempts).toBe(true);
    // If the (skipped) lock-check branch had run, it would have deleted
    // and re-inserted quiz_questions - three calls instead of one.
    const quizQuestionsCalls = client.from.mock.calls.filter(
      ([table]) => table === "quiz_questions",
    );
    expect(quizQuestionsCalls).toHaveLength(1);
  });
});

describe("teacher quiz actions - createQuizAction", () => {
  it("assigns to classes only when classIds is provided", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    const withClasses = createMockSupabaseClient({
      quizzes: { data: quizRow, error: null },
      quiz_assignments: [
        { data: null, error: null }, // insert
        { data: [], error: null }, // buildQuizListItem select
      ],
      quiz_questions: { data: null, error: null, count: 0 },
      quiz_attempts: { data: null, error: null, count: 0 },
    });
    vi.mocked(createClient).mockResolvedValue(withClasses as never);

    await createQuizAction({
      title: "Chapter 3",
      questions: [],
      classIds: ["class-1"],
    });

    expect(
      withClasses.from.mock.calls.filter(([t]) => t === "quiz_assignments"),
    ).toHaveLength(2);
  });

  it("skips class assignment when no classIds are given", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    const withoutClasses = createMockSupabaseClient({
      quizzes: { data: quizRow, error: null },
      quiz_assignments: { data: [], error: null },
      quiz_questions: { data: null, error: null, count: 0 },
      quiz_attempts: { data: null, error: null, count: 0 },
    });
    vi.mocked(createClient).mockResolvedValue(withoutClasses as never);

    await createQuizAction({ title: "Chapter 3", questions: [] });

    expect(
      withoutClasses.from.mock.calls.filter(([t]) => t === "quiz_assignments"),
    ).toHaveLength(1);
  });
});

describe("teacher quiz actions - deleteQuizAction", () => {
  it("deletes the quiz with no guard, even if it has attempts", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        quizzes: [
          { data: quizRow, error: null }, // requireOwnedQuiz
          { data: null, error: null }, // delete
        ],
      }) as never,
    );

    await expect(deleteQuizAction("quiz-1")).resolves.toBeUndefined();
  });

  it("throws when the quiz isn't owned by this teacher", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        quizzes: { data: null, error: null },
      }) as never,
    );

    await expect(deleteQuizAction("quiz-missing")).rejects.toThrow(
      "Quiz not found",
    );
  });
});

describe("teacher quiz actions - getQuizResultsAction roster", () => {
  it("keeps a past result visible even after the quiz is reassigned to a different class", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        quizzes: { data: quizRow, error: null },
        quiz_questions: { data: [{ id: "q1", points: 5 }], error: null },
        // Quiz is now only assigned to class-2.
        quiz_assignments: { data: [{ class_id: "class-2" }], error: null },
        // class-2's current roster is just student-B.
        student_class_assignments: {
          data: [{ student_id: "student-b" }],
          error: null,
        },
        // student-a took it in the past (while it was assigned to a
        // different class) and isn't on the current roster anymore.
        quiz_attempts: {
          data: [
            {
              id: "attempt-1",
              student_id: "student-a",
              score: 4,
              submitted_at: "2026-01-02T00:00:00Z",
            },
          ],
          error: null,
        },
        students: {
          data: [
            { id: "student-a", first_name: "Alex", last_name: "A" },
            { id: "student-b", first_name: "Blair", last_name: "B" },
          ],
          error: null,
        },
        quiz_attempt_answers: { data: [], error: null },
      }) as never,
    );

    const results = await getQuizResultsAction("quiz-1");

    const studentAResult = results.results.find(
      (row) => row.studentId === "student-a",
    );
    expect(studentAResult).toBeDefined();
    expect(studentAResult?.completed).toBe(true);
    expect(studentAResult?.score).toBe(4);

    const studentBResult = results.results.find(
      (row) => row.studentId === "student-b",
    );
    expect(studentBResult).toBeDefined();
    expect(studentBResult?.completed).toBe(false);
  });
});

describe("teacher quiz actions - question images", () => {
  it("passes a question's image_path through to the insert", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    const client = createMockSupabaseClient({
      quizzes: { data: quizRow, error: null },
      quiz_questions: [
        { data: { id: "question-1" }, error: null }, // insert
        { data: null, error: null, count: 1 }, // buildQuizListItem count
      ],
      quiz_assignments: { data: [], error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createQuizAction({
      title: "Chapter 3",
      questions: [
        {
          questionText: "What shape is this?",
          questionType: "short_answer",
          points: 1,
          options: [],
          imagePath: "teacher-1/shape.png",
        },
      ],
    });

    const chain = findChain(client, "quiz_questions");
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ image_path: "teacher-1/shape.png" }),
    );
  });

  it("deletes a stale image that's no longer referenced after an edit, but leaves a carried-over one alone", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    const client = createMockSupabaseClient({
      quizzes: [
        { data: quizRow, error: null }, // requireOwnedQuiz
        { data: quizRow, error: null }, // update + select
      ],
      quiz_attempts: [
        { data: null, error: null, count: 0 }, // lock check
        { data: null, error: null, count: 0 }, // buildQuizListItem
      ],
      quiz_questions: [
        {
          data: [
            { image_path: "teacher-1/old.png" },
            { image_path: "teacher-1/kept.png" },
          ],
          error: null,
        }, // select old image_paths
        { data: null, error: null }, // delete existing
        { data: { id: "question-2" }, error: null }, // insert replacement
        { data: null, error: null, count: 1 }, // buildQuizListItem count
      ],
      quiz_assignments: { data: [], error: null },
    });
    const removeMock = vi.fn(async () => ({ data: null, error: null }));
    client.storage = { from: vi.fn(() => ({ remove: removeMock })) };
    vi.mocked(createClient).mockResolvedValue(client as never);

    await updateQuizAction({
      quizId: "quiz-1",
      title: "Chapter 3",
      questions: [
        {
          questionText: "Still has its image",
          questionType: "short_answer",
          points: 1,
          options: [],
          imagePath: "teacher-1/kept.png",
        },
        {
          questionText: "New question, no image",
          questionType: "short_answer",
          points: 1,
          options: [],
          imagePath: null,
        },
      ],
    });

    expect(removeMock).toHaveBeenCalledWith(["teacher-1/old.png"]);
  });

  it("cleans up every referenced image when the quiz is deleted", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    const client = createMockSupabaseClient({
      quizzes: [
        { data: quizRow, error: null }, // requireOwnedQuiz
        { data: null, error: null }, // delete
      ],
      quiz_questions: {
        data: [{ image_path: "teacher-1/a.png" }, { image_path: null }],
        error: null,
      },
    });
    const removeMock = vi.fn(async () => ({ data: null, error: null }));
    client.storage = { from: vi.fn(() => ({ remove: removeMock })) };
    vi.mocked(createClient).mockResolvedValue(client as never);

    await deleteQuizAction("quiz-1");

    expect(removeMock).toHaveBeenCalledWith(["teacher-1/a.png"]);
  });
});

describe("teacher quiz actions - requireOwnedQuiz gate", () => {
  it("throws Quiz not found before touching quiz_assignments", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        quizzes: { data: null, error: null },
      }) as never,
    );

    await expect(
      assignQuizToClassAction("quiz-missing", "class-1"),
    ).rejects.toThrow("Quiz not found");
  });
});

describe("teacher quiz actions - getClassPendingGradingAction", () => {
  it("returns short-answer responses awaiting grading, scoped to the class", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        classes: { data: { id: "class-1" }, error: null },
        quiz_assignments: { data: [{ quiz_id: "quiz-1" }], error: null },
        student_class_assignments: {
          data: [{ student_id: "student-1" }],
          error: null,
        },
        quiz_attempts: {
          data: [
            { id: "attempt-1", quiz_id: "quiz-1", student_id: "student-1" },
          ],
          error: null,
        },
        quiz_attempt_answers: {
          data: [
            {
              id: "answer-1",
              attempt_id: "attempt-1",
              question_id: "q1",
              text_answer: "Because 2x = 4, so x = 2",
            },
          ],
          error: null,
        },
        quiz_questions: {
          data: [{ id: "q1", question_text: "Explain your reasoning", points: 2 }],
          error: null,
        },
        quizzes: { data: [{ id: "quiz-1", title: "Chapter 3 Quiz" }], error: null },
        students: {
          data: [{ id: "student-1", first_name: "Maya", last_name: "Carter" }],
          error: null,
        },
      }) as never,
    );

    const result = await getClassPendingGradingAction("class-1");

    expect(result).toEqual([
      {
        answerId: "answer-1",
        quizId: "quiz-1",
        quizTitle: "Chapter 3 Quiz",
        questionId: "q1",
        questionText: "Explain your reasoning",
        points: 2,
        studentId: "student-1",
        studentName: "Maya Carter",
        textAnswer: "Because 2x = 4, so x = 2",
      },
    ]);
  });

  it("returns an empty list without querying attempts when no quizzes are assigned", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    const client = createMockSupabaseClient({
      classes: { data: { id: "class-1" }, error: null },
      quiz_assignments: { data: [], error: null },
      student_class_assignments: {
        data: [{ student_id: "student-1" }],
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await getClassPendingGradingAction("class-1");

    expect(result).toEqual([]);
    expect(
      client.from.mock.calls.filter(([t]) => t === "quiz_attempts"),
    ).toHaveLength(0);
  });
});

describe("teacher quiz actions - gradeShortAnswerAction", () => {
  it("grades an answer correct and syncs the score onto the attempt and its matching best-attempt row", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        quiz_attempt_answers: [
          {
            data: {
              id: "answer-1",
              attempt_id: "attempt-1",
              question_id: "q1",
              text_answer: "Because 2x = 4, so x = 2",
            },
            error: null,
          }, // fetch the answer
          { data: null, error: null }, // update is_correct/points_awarded
          { data: [{ points_awarded: 2 }], error: null }, // recompute attempt score
        ],
        quiz_attempts: [
          { data: { id: "attempt-1", quiz_id: "quiz-1" }, error: null }, // fetch attempt
          { data: null, error: null }, // update score
        ],
        quizzes: { data: quizRow, error: null }, // requireOwnedQuiz
        quiz_questions: { data: { points: 2 }, error: null },
        quiz_attempt_best_answers: [
          {
            data: {
              id: "best-answer-1",
              text_answer: "Because 2x = 4, so x = 2",
            },
            error: null,
          }, // matching best answer for this question
          { data: null, error: null }, // update
          { data: [{ points_awarded: 2 }], error: null }, // recompute best score
        ],
        quiz_attempt_bests: { data: null, error: null }, // update score
      }) as never,
    );

    await expect(
      gradeShortAnswerAction("answer-1", true),
    ).resolves.toBeUndefined();
  });

  it("does not touch the best-attempt row when its answer to this question differs", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    const client = createMockSupabaseClient({
      quiz_attempt_answers: [
        {
          data: {
            id: "answer-1",
            attempt_id: "attempt-1",
            question_id: "q1",
            text_answer: "wrong answer text",
          },
          error: null,
        },
        { data: null, error: null }, // update
        { data: [{ points_awarded: 0 }], error: null }, // recompute
      ],
      quiz_attempts: [
        { data: { id: "attempt-1", quiz_id: "quiz-1" }, error: null },
        { data: null, error: null },
      ],
      quizzes: { data: quizRow, error: null },
      quiz_questions: { data: { points: 2 }, error: null },
      quiz_attempt_best_answers: {
        // The best attempt answered this question differently (a later
        // retry) - grading the official attempt must not overwrite it.
        data: { id: "best-answer-1", text_answer: "a different retry answer" },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await gradeShortAnswerAction("answer-1", false);

    expect(
      client.from.mock.calls.filter(
        ([t]) => t === "quiz_attempt_bests",
      ),
    ).toHaveLength(0);
    const bestAnswersCalls = client.from.mock.calls.filter(
      ([t]) => t === "quiz_attempt_best_answers",
    );
    expect(bestAnswersCalls).toHaveLength(1);
  });
});

describe("teacher quiz actions - regradeShortAnswerWithAiAction", () => {
  it("writes the AI's verdict, marking it ai-graded", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    vi.mocked(gradeShortAnswerWithAI).mockResolvedValue({
      isCorrect: true,
      reasoning: "Equivalent to the model answer.",
    });
    const client = createMockSupabaseClient({
      quiz_attempt_answers: [
        {
          data: {
            id: "answer-1",
            attempt_id: "attempt-1",
            question_id: "q1",
            text_answer: "four",
          },
          error: null,
        }, // fetch the answer
        { data: null, error: null }, // write the grade
        { data: [{ points_awarded: 1 }], error: null }, // recompute score
      ],
      quiz_attempts: [
        { data: { id: "attempt-1", quiz_id: "quiz-1" }, error: null },
        { data: null, error: null }, // update score
      ],
      quizzes: { data: quizRow, error: null }, // requireOwnedQuiz
      quiz_questions: {
        data: { question_text: "What is 2+2?", model_answer: "4", points: 1 },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      regradeShortAnswerWithAiAction("answer-1"),
    ).resolves.toBeUndefined();

    expect(gradeShortAnswerWithAI).toHaveBeenCalledWith({
      questionText: "What is 2+2?",
      modelAnswer: "4",
      textAnswer: "four",
      points: 1,
    });
  });

  it("throws an ExpectedError when AI grading is unavailable", async () => {
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
    vi.mocked(gradeShortAnswerWithAI).mockResolvedValue(null);
    const client = createMockSupabaseClient({
      quiz_attempt_answers: {
        data: {
          id: "answer-1",
          attempt_id: "attempt-1",
          question_id: "q1",
          text_answer: "four",
        },
        error: null,
      },
      quiz_attempts: {
        data: { id: "attempt-1", quiz_id: "quiz-1" },
        error: null,
      },
      quizzes: { data: quizRow, error: null },
      quiz_questions: {
        data: { question_text: "What is 2+2?", model_answer: null, points: 1 },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      regradeShortAnswerWithAiAction("answer-1"),
    ).rejects.toThrow(ExpectedError);
  });
});
