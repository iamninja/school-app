import { describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  assignQuizToClassAction,
  createQuizAction,
  updateQuizAction,
} from "@/app/protected/teacher/quiz-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

const quizRow = {
  id: "quiz-1",
  title: "Chapter 3",
  description: null,
  time_limit_minutes: null,
  created_at: "2026-08-16T00:00:00Z",
};

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
