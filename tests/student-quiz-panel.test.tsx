import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { StudentQuizPanel } from "@/components/student-quiz-panel";
import * as quizActions from "@/app/student-dashboard/quiz-actions";

vi.mock("@/app/student-dashboard/quiz-actions", () => ({
  getQuizForTakingAction: vi.fn(),
  getQuizReviewAction: vi.fn(),
  submitQuizAttemptAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const quizzes = [
  {
    id: "quiz-1",
    title: "Chapter 3 Quiz",
    classId: "class-1",
    className: "Algebra II",
    completed: false,
    score: null,
    maxScore: 1,
    submittedAt: null,
  },
];

const sampleQuizForTaking = {
  id: "quiz-1",
  title: "Chapter 3 Quiz",
  description: null,
  questions: [
    {
      id: "q1",
      questionText: "2 + 2 = ?",
      questionType: "multiple_choice" as const,
      orderIndex: 0,
      points: 1,
      options: [
        { id: "opt-1", optionText: "4", orderIndex: 0 },
        { id: "opt-2", optionText: "5", orderIndex: 1 },
      ],
    },
  ],
};

describe("StudentQuizPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a message when there are no quizzes", () => {
    render(<StudentQuizPanel quizzes={[]} />);
    expect(screen.getByText(/no quizzes assigned yet/i)).toBeInTheDocument();
  });

  it("lists available quizzes with a Take Quiz button", () => {
    render(<StudentQuizPanel quizzes={quizzes} />);
    expect(screen.getByText("Chapter 3 Quiz")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /take quiz/i }),
    ).toBeInTheDocument();
  });

  it("shows a Review button with score for a completed quiz", () => {
    render(
      <StudentQuizPanel
        quizzes={[
          {
            ...quizzes[0],
            completed: true,
            score: 1,
            submittedAt: "2026-01-02T00:00:00Z",
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: /1 \/ 1.*review/i }),
    ).toBeInTheDocument();
  });

  it("loads and displays quiz questions when taking a quiz", async () => {
    const user = userEvent.setup();
    const getQuizForTakingAction = vi.mocked(
      quizActions.getQuizForTakingAction,
    );
    getQuizForTakingAction.mockResolvedValue(sampleQuizForTaking);

    render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /take quiz/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 \+ 2 = \?/)).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "4" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "5" })).toBeInTheDocument();
    });
  });

  it("submits answers and shows the review with score", async () => {
    const user = userEvent.setup();
    const getQuizForTakingAction = vi.mocked(
      quizActions.getQuizForTakingAction,
    );
    const submitQuizAttemptAction = vi.mocked(
      quizActions.submitQuizAttemptAction,
    );

    getQuizForTakingAction.mockResolvedValue(sampleQuizForTaking);
    submitQuizAttemptAction.mockResolvedValue({
      attemptId: "attempt-1",
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      score: 1,
      maxScore: 1,
      submittedAt: "2026-01-02T00:00:00Z",
      answers: [
        {
          questionId: "q1",
          questionText: "2 + 2 = ?",
          questionType: "multiple_choice",
          selectedOptionId: "opt-1",
          textAnswer: null,
          correctOptionId: "opt-1",
          isCorrect: true,
          pointsAwarded: 1,
          pointsPossible: 1,
        },
      ],
    });

    render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /take quiz/i }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "4" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("radio", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /submit quiz/i }));

    await waitFor(() => {
      expect(submitQuizAttemptAction).toHaveBeenCalledWith("quiz-1", [
        { questionId: "q1", selectedOptionId: "opt-1" },
      ]);
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
      expect(screen.getByText(/correct/i)).toBeInTheDocument();
    });
  });

  it("shows an error toast when submitting without answering all questions", async () => {
    const user = userEvent.setup();
    const getQuizForTakingAction = vi.mocked(
      quizActions.getQuizForTakingAction,
    );
    const submitQuizAttemptAction = vi.mocked(
      quizActions.submitQuizAttemptAction,
    );
    getQuizForTakingAction.mockResolvedValue(sampleQuizForTaking);

    render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /take quiz/i }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "4" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /submit quiz/i }));

    expect(toast.error).toHaveBeenCalled();
    expect(submitQuizAttemptAction).not.toHaveBeenCalled();
  });

  it("loads a past review when Review is clicked for a completed quiz", async () => {
    const user = userEvent.setup();
    const getQuizReviewAction = vi.mocked(quizActions.getQuizReviewAction);
    getQuizReviewAction.mockResolvedValue({
      attemptId: "attempt-1",
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      score: 1,
      maxScore: 1,
      submittedAt: "2026-01-02T00:00:00Z",
      answers: [
        {
          questionId: "q1",
          questionText: "2 + 2 = ?",
          questionType: "multiple_choice",
          selectedOptionId: "opt-1",
          textAnswer: null,
          correctOptionId: "opt-1",
          isCorrect: true,
          pointsAwarded: 1,
          pointsPossible: 1,
        },
      ],
    });

    render(
      <StudentQuizPanel
        quizzes={[
          {
            ...quizzes[0],
            completed: true,
            score: 1,
            submittedAt: "2026-01-02T00:00:00Z",
          },
        ]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /1 \/ 1.*review/i }),
    );

    await waitFor(() => {
      expect(getQuizReviewAction).toHaveBeenCalledWith("quiz-1");
      expect(screen.getByText("1 / 1")).toBeInTheDocument();
    });
  });
});
