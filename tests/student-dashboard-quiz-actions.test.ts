import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { submitQuizAttemptAction } from "@/app/student-dashboard/quiz-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

function findChain(client: ReturnType<typeof createMockSupabaseClient>, table: string) {
  const index = client.from.mock.calls.findIndex(([t]) => t === table);
  if (index === -1) {
    throw new Error(`"${table}" was never queried`);
  }
  return client.from.mock.results[index].value;
}

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
      quiz_attempts: {
        data: { id: "attempt-1", submitted_at: "2026-01-02T00:00:00Z" },
        error: null,
      },
      quiz_attempt_answers: { data: null, error: null },
      quiz_attempt_starts: { data: null, error: null },
    }, { id: "user-1" });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const review = await submitQuizAttemptAction("quiz-1", [
      { questionId: "q1", selectedOptionId: "opt-1" },
    ]);

    expect(review.score).toBe(5);
    expect(review.maxScore).toBe(5);

    const attemptsChain = findChain(client, "quiz_attempts");
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
      quiz_attempts: {
        data: { id: "attempt-2", submitted_at: "2026-01-02T00:00:00Z" },
        error: null,
      },
      quiz_attempt_answers: { data: null, error: null },
      quiz_attempt_starts: { data: null, error: null },
    }, { id: "user-1" });
    vi.mocked(createClient).mockResolvedValue(client as never);

    // Only answers q1 - q2 is left blank.
    await submitQuizAttemptAction("quiz-1", [
      { questionId: "q1", selectedOptionId: "opt-1" },
    ]);

    const attemptsChain = findChain(client, "quiz_attempts");
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
        quiz_attempts: {
          data: { id: "attempt-1", submitted_at: "2026-01-02T00:00:00Z" },
          error: null,
        },
        quiz_attempt_answers: { data: null, error: null },
        quiz_attempt_starts: { data: null, error: null },
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
        quiz_attempts: {
          data: { id: "attempt-1", submitted_at: "2026-01-02T00:00:00Z" },
          error: null,
        },
        quiz_attempt_answers: { data: null, error: null },
        quiz_attempt_starts: { data: null, error: null },
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
