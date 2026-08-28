import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import {
  getQuizForTakingAction,
  submitQuizAttemptAction,
} from "@/app/student-dashboard/quiz-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

function findChain(
  client: ReturnType<typeof createMockSupabaseClient>,
  table: string,
  occurrence = 0,
) {
  const indices = client.from.mock.calls
    .map((call, i) => (call[0] === table ? i : -1))
    .filter((i) => i !== -1);
  const index = indices[occurrence];
  if (index === undefined) {
    throw new Error(`"${table}" was not queried ${occurrence + 1} time(s)`);
  }
  return client.from.mock.results[index].value;
}

const twoQuestions = [
  { id: "q1", question_text: "First?", question_type: "short_answer", order_index: 0, points: 1, image_path: null },
  { id: "q2", question_text: "Second?", question_type: "short_answer", order_index: 1, points: 1, image_path: null },
];

describe("getQuizForTakingAction - question shuffle", () => {
  it("keeps authored order_index order when shuffle is off for this student", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quiz_attempts: { data: null, error: null },
        quizzes: {
          data: { id: "quiz-1", title: "T", description: null, time_limit_minutes: null },
          error: null,
        },
        quiz_attempt_starts: [
          { data: null, error: null }, // upsert
          { data: { started_at: null, question_order: null }, error: null }, // select
        ],
        quiz_questions: { data: twoQuestions, error: null },
        quiz_question_options: { data: [], error: null },
      },
      { id: "user-1" },
      { data: false, error: null }, // is_quiz_shuffled_for_student
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    const quiz = await getQuizForTakingAction("quiz-1");

    expect(quiz.questions.map((q) => q.id)).toEqual(["q1", "q2"]);
  });

  it("shuffles and persists the order on first load when shuffle is on", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quiz_attempts: { data: null, error: null },
        quizzes: {
          data: { id: "quiz-1", title: "T", description: null, time_limit_minutes: null },
          error: null,
        },
        quiz_attempt_starts: [
          { data: null, error: null }, // upsert
          { data: { started_at: null, question_order: null }, error: null }, // select, no stored order yet
          { data: null, error: null }, // update, persisting the freshly shuffled order
        ],
        quiz_questions: { data: twoQuestions, error: null },
        quiz_question_options: { data: [], error: null },
      },
      { id: "user-1" },
      { data: true, error: null }, // is_quiz_shuffled_for_student
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    // Forces the Fisher-Yates swap on a 2-item array to reverse it deterministically.
    vi.spyOn(Math, "random").mockReturnValue(0);

    const quiz = await getQuizForTakingAction("quiz-1");

    expect(quiz.questions.map((q) => q.id)).toEqual(["q2", "q1"]);

    const attemptStartCalls = client.from.mock.calls.filter(
      ([table]) => table === "quiz_attempt_starts",
    );
    expect(attemptStartCalls).toHaveLength(3);
    const updateChain = client.from.mock.results[
      client.from.mock.calls.indexOf(attemptStartCalls[2])
    ].value;
    expect(updateChain.update).toHaveBeenCalledWith({
      question_order: ["q2", "q1"],
    });

    vi.spyOn(Math, "random").mockRestore();
  });

  it("reuses the stored order on a later load instead of reshuffling", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quiz_attempts: { data: null, error: null },
        quizzes: {
          data: { id: "quiz-1", title: "T", description: null, time_limit_minutes: null },
          error: null,
        },
        quiz_attempt_starts: [
          { data: null, error: null }, // upsert
          { data: { started_at: null, question_order: ["q2", "q1"] }, error: null },
        ],
        quiz_questions: { data: twoQuestions, error: null },
        quiz_question_options: { data: [], error: null },
      },
      { id: "user-1" },
      { data: true, error: null }, // is_quiz_shuffled_for_student
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    const quiz = await getQuizForTakingAction("quiz-1");

    expect(quiz.questions.map((q) => q.id)).toEqual(["q2", "q1"]);
    expect(
      client.from.mock.calls.filter(([table]) => table === "quiz_attempt_starts"),
    ).toHaveLength(2);
  });
});

describe("getQuizForTakingAction - retake limit", () => {
  it("blocks a retake once the student has used all their attempts", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quiz_attempts: { data: { id: "attempt-1" }, error: null },
        quiz_attempt_bests: { data: { attempts_used: 3 }, error: null },
      },
      { id: "user-1" },
      { data: 3, error: null }, // quiz_max_attempts_for_student
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(getQuizForTakingAction("quiz-1")).rejects.toThrow(
      "You have used all your attempts for this quiz",
    );
  });

  it("allows a retake when attempts remain", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quiz_attempts: { data: { id: "attempt-1" }, error: null },
        quiz_attempt_bests: { data: { attempts_used: 1 }, error: null },
        quizzes: {
          data: { id: "quiz-1", title: "T", description: null, time_limit_minutes: null },
          error: null,
        },
        quiz_attempt_starts: [
          { data: null, error: null },
          { data: { started_at: null, question_order: null }, error: null },
        ],
        quiz_questions: { data: twoQuestions, error: null },
        quiz_question_options: { data: [], error: null },
      },
      { id: "user-1" },
      { data: 3, error: null }, // quiz_max_attempts_for_student
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    const quiz = await getQuizForTakingAction("quiz-1");

    expect(quiz.id).toBe("quiz-1");
  });
});

describe("submitQuizAttemptAction - retake best-tracking", () => {
  const oneMultipleChoiceQuestion = [
    { id: "q1", question_text: "2 + 2 = ?", question_type: "multiple_choice", points: 5, image_path: null },
  ];
  const options = [
    { id: "opt-1", question_id: "q1", option_text: "4", is_correct: true },
    { id: "opt-2", question_id: "q1", option_text: "5", is_correct: false },
  ];

  it("replaces the best score and answers when a retry beats the current best", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quizzes: { data: { id: "quiz-1", title: "T" }, error: null },
        quiz_questions: { data: oneMultipleChoiceQuestion, error: null },
        quiz_question_options: { data: options, error: null },
        quiz_attempts: {
          data: { id: "attempt-1", submitted_at: "2026-01-01T00:00:00Z", score: 0 },
          error: null,
        }, // existingAttempt - official score stays 0 forever
        quiz_attempt_bests: [
          { data: { score: 0, attempts_used: 1 }, error: null }, // currentBest
          {
            data: { score: 5, submitted_at: "2026-01-03T00:00:00Z", attempts_used: 2 },
            error: null,
          }, // updatedBest
        ],
        quiz_attempt_best_answers: [
          { data: null, error: null }, // delete
          { data: null, error: null }, // insert
        ],
        quiz_attempt_answers: { data: [], error: null }, // officialAnswers refetch
        quiz_attempt_starts: { data: null, error: null },
      },
      { id: "user-1" },
      { data: 3, error: null }, // quiz_max_attempts_for_student
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    const review = await submitQuizAttemptAction("quiz-1", [
      { questionId: "q1", selectedOptionId: "opt-1" },
    ]);

    // The official score/answers never change on a retry.
    expect(review.score).toBe(0);
    expect(review.attemptsUsed).toBe(2);
    expect(review.canRetake).toBe(true);
    expect(review.best).toEqual({
      score: 5,
      submittedAt: "2026-01-03T00:00:00Z",
      answers: expect.any(Array),
    });

    expect(
      client.from.mock.calls.filter(
        ([table]) => table === "quiz_attempt_best_answers",
      ),
    ).toHaveLength(2);
  });

  it("discards a retry that doesn't beat the current best, leaving it unchanged", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quizzes: { data: { id: "quiz-1", title: "T" }, error: null },
        quiz_questions: { data: oneMultipleChoiceQuestion, error: null },
        quiz_question_options: { data: options, error: null },
        quiz_attempts: {
          data: { id: "attempt-1", submitted_at: "2026-01-01T00:00:00Z", score: 5 },
          error: null,
        },
        quiz_attempt_bests: [
          { data: { score: 5, attempts_used: 1 }, error: null }, // currentBest
          { data: { score: 5, submitted_at: "2026-01-01T00:00:00Z", attempts_used: 2 }, error: null }, // updatedBest (unchanged score)
        ],
        quiz_attempt_best_answers: {
          data: [
            {
              question_id: "q1",
              selected_option_id: "opt-1",
              text_answer: null,
              is_correct: true,
              points_awarded: 5,
            },
          ],
          error: null,
        }, // storedBestAnswers - the retry's own wrong answer is never written here
        quiz_attempt_answers: { data: [], error: null },
        quiz_attempt_starts: { data: null, error: null },
      },
      { id: "user-1" },
      { data: 3, error: null },
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    // This retry answers wrong (selects the incorrect option), so it scores
    // 0 - well below the existing best of 5.
    const review = await submitQuizAttemptAction("quiz-1", [
      { questionId: "q1", selectedOptionId: "opt-2" },
    ]);

    expect(review.best?.score).toBe(5);
    expect(review.best?.answers[0].isCorrect).toBe(true);
    expect(review.best?.answers[0].pointsAwarded).toBe(5);

    // No delete/insert into quiz_attempt_best_answers - only the read that
    // re-fetches the untouched stored best answers for the response.
    expect(
      client.from.mock.calls.filter(
        ([table]) => table === "quiz_attempt_best_answers",
      ),
    ).toHaveLength(1);
  });

  it("blocks a submission once the student has already used all their attempts", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quizzes: { data: { id: "quiz-1", title: "T" }, error: null },
        quiz_questions: { data: oneMultipleChoiceQuestion, error: null },
        quiz_question_options: { data: options, error: null },
        quiz_attempts: {
          data: { id: "attempt-1", submitted_at: "2026-01-01T00:00:00Z", score: 5 },
          error: null,
        },
        quiz_attempt_bests: { data: { score: 5, attempts_used: 3 }, error: null },
      },
      { id: "user-1" },
      { data: 3, error: null },
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      submitQuizAttemptAction("quiz-1", [
        { questionId: "q1", selectedOptionId: "opt-1" },
      ]),
    ).rejects.toThrow("You have used all your attempts for this quiz");
  });
});

describe("submitQuizAttemptAction - snapshot columns", () => {
  it("saves quiz_title and max_score on the attempt row, so the attempt survives the quiz being deleted", async () => {
    const client = createMockSupabaseClient({
      students: { data: { id: "student-1" }, error: null },
      quizzes: { data: { id: "quiz-1", title: "Chapter 3 Quiz" }, error: null },
      quiz_questions: {
        data: [
          {
            id: "q1",
            question_text: "2 + 2 = ?",
            question_type: "multiple_choice",
            points: 5,
          },
        ],
        error: null,
      },
      quiz_question_options: {
        data: [
          { id: "opt-1", question_id: "q1", option_text: "4", is_correct: true },
          { id: "opt-2", question_id: "q1", option_text: "5", is_correct: false },
        ],
        error: null,
      },
      quiz_attempts: [
        { data: null, error: null }, // existingAttempt check - first attempt
        {
          data: { id: "attempt-1", submitted_at: "2026-01-02T00:00:00Z" },
          error: null,
        }, // insert
      ],
      quiz_attempt_answers: { data: null, error: null },
      quiz_attempt_starts: { data: null, error: null },
      quiz_attempt_bests: {
        data: { score: 5, submitted_at: "2026-01-02T00:00:00Z", attempts_used: 1 },
        error: null,
      },
      quiz_attempt_best_answers: { data: null, error: null },
    }, { id: "user-1" });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const review = await submitQuizAttemptAction("quiz-1", [
      { questionId: "q1", selectedOptionId: "opt-1" },
    ]);

    expect(review.score).toBe(5);
    expect(review.maxScore).toBe(5);

    const attemptsChain = findChain(client, "quiz_attempts", 1);
    expect(attemptsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        quiz_title: "Chapter 3 Quiz",
        max_score: 5,
      }),
    );
  });

  it("snapshots max_score as the sum of every question's points, not just the answered ones", async () => {
    const client = createMockSupabaseClient({
      students: { data: { id: "student-1" }, error: null },
      quizzes: { data: { id: "quiz-1", title: "Two Questions" }, error: null },
      quiz_questions: {
        data: [
          {
            id: "q1",
            question_text: "2 + 2 = ?",
            question_type: "multiple_choice",
            points: 5,
          },
          {
            id: "q2",
            question_text: "3 + 3 = ?",
            question_type: "multiple_choice",
            points: 3,
          },
        ],
        error: null,
      },
      quiz_question_options: {
        data: [
          { id: "opt-1", question_id: "q1", option_text: "4", is_correct: true },
          { id: "opt-2", question_id: "q2", option_text: "6", is_correct: true },
        ],
        error: null,
      },
      quiz_attempts: [
        { data: null, error: null }, // existingAttempt check - first attempt
        {
          data: { id: "attempt-2", submitted_at: "2026-01-02T00:00:00Z" },
          error: null,
        }, // insert
      ],
      quiz_attempt_answers: { data: null, error: null },
      quiz_attempt_starts: { data: null, error: null },
      quiz_attempt_bests: {
        data: { score: 5, submitted_at: "2026-01-02T00:00:00Z", attempts_used: 1 },
        error: null,
      },
      quiz_attempt_best_answers: { data: null, error: null },
    }, { id: "user-1" });
    vi.mocked(createClient).mockResolvedValue(client as never);

    // Only answers q1 - q2 is left blank.
    await submitQuizAttemptAction("quiz-1", [
      { questionId: "q1", selectedOptionId: "opt-1" },
    ]);

    const attemptsChain = findChain(client, "quiz_attempts", 1);
    expect(attemptsChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ max_score: 8, score: 5 }),
    );
  });
});

describe("submitQuizAttemptAction - question images", () => {
  it("attaches a signed image URL to the review when a question has an image", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quizzes: { data: { id: "quiz-1", title: "Chapter 3 Quiz" }, error: null },
        quiz_questions: {
          data: [
            {
              id: "q1",
              question_text: "What shape is this?",
              question_type: "multiple_choice",
              points: 5,
              image_path: "teacher-1/diagram.png",
            },
          ],
          error: null,
        },
        quiz_question_options: {
          data: [
            { id: "opt-1", question_id: "q1", option_text: "Square", is_correct: true },
            { id: "opt-2", question_id: "q1", option_text: "Circle", is_correct: false },
          ],
          error: null,
        },
        quiz_attempts: [
          { data: null, error: null }, // existingAttempt check - first attempt
          {
            data: { id: "attempt-1", submitted_at: "2026-01-02T00:00:00Z" },
            error: null,
          }, // insert
        ],
        quiz_attempt_answers: { data: null, error: null },
        quiz_attempt_starts: { data: null, error: null },
        quiz_attempt_bests: {
          data: { score: 5, submitted_at: "2026-01-02T00:00:00Z", attempts_used: 1 },
          error: null,
        },
        quiz_attempt_best_answers: { data: null, error: null },
      },
      { id: "user-1" },
    );
    client.storage = {
      from: vi.fn(() => ({
        createSignedUrls: vi.fn(async () => ({
          data: [
            {
              path: "teacher-1/diagram.png",
              signedUrl: "https://signed.example/diagram.png",
            },
          ],
          error: null,
        })),
      })),
    };
    vi.mocked(createClient).mockResolvedValue(client as never);

    const review = await submitQuizAttemptAction("quiz-1", [
      { questionId: "q1", selectedOptionId: "opt-1" },
    ]);

    expect(review.answers[0].imageUrl).toBe(
      "https://signed.example/diagram.png",
    );
  });

  it("leaves imageUrl null for a question with no image, without calling Storage", async () => {
    const client = createMockSupabaseClient(
      {
        students: { data: { id: "student-1" }, error: null },
        quizzes: { data: { id: "quiz-1", title: "Chapter 3 Quiz" }, error: null },
        quiz_questions: {
          data: [
            {
              id: "q1",
              question_text: "2 + 2 = ?",
              question_type: "multiple_choice",
              points: 5,
              image_path: null,
            },
          ],
          error: null,
        },
        quiz_question_options: {
          data: [
            { id: "opt-1", question_id: "q1", option_text: "4", is_correct: true },
          ],
          error: null,
        },
        quiz_attempts: [
          { data: null, error: null }, // existingAttempt check - first attempt
          {
            data: { id: "attempt-1", submitted_at: "2026-01-02T00:00:00Z" },
            error: null,
          }, // insert
        ],
        quiz_attempt_answers: { data: null, error: null },
        quiz_attempt_starts: { data: null, error: null },
        quiz_attempt_bests: {
          data: { score: 5, submitted_at: "2026-01-02T00:00:00Z", attempts_used: 1 },
          error: null,
        },
        quiz_attempt_best_answers: { data: null, error: null },
      },
      { id: "user-1" },
    );
    const storageFrom = vi.fn();
    client.storage = { from: storageFrom };
    vi.mocked(createClient).mockResolvedValue(client as never);

    const review = await submitQuizAttemptAction("quiz-1", [
      { questionId: "q1", selectedOptionId: "opt-1" },
    ]);

    expect(review.answers[0].imageUrl).toBeNull();
    expect(storageFrom).not.toHaveBeenCalled();
  });
});
