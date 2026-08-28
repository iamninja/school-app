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
    className: "Algebra II",
    completed: false,
    score: null,
    maxScore: 1,
    submittedAt: null,
    quizDeleted: false,
    bestScore: null,
    attemptsUsed: 0,
    maxAttempts: null,
    canRetake: false,
  },
];

const sampleQuizForTaking = {
  id: "quiz-1",
  title: "Chapter 3 Quiz",
  description: null,
  timeLimitMinutes: null,
  startedAt: null,
  questions: [
    {
      id: "q1",
      questionText: "2 + 2 = ?",
      questionType: "multiple_choice" as const,
      orderIndex: 0,
      points: 1,
      imageUrl: null,
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
    expect(
      screen.getByText(/δεν έχουν ανατεθεί τεστ/i),
    ).toBeInTheDocument();
  });

  it("lists available quizzes with a Take Quiz button", () => {
    render(<StudentQuizPanel quizzes={quizzes} />);
    expect(screen.getByText("Chapter 3 Quiz")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /έναρξη τεστ/i }),
    ).toBeInTheDocument();
  });

  it("renders LaTeX in a quiz title in the quiz list", () => {
    const { container } = render(
      <StudentQuizPanel
        quizzes={[{ ...quizzes[0], title: "Solving $x^2 = 4$" }]}
      />,
    );
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("shows a Review button and an official-score badge for a completed quiz", () => {
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
      screen.getByRole("button", { name: /ανασκόπηση/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/βαθμός: 1 \/ 1/i)).toBeInTheDocument();
  });

  it("shows a plain score badge with no review button for a deleted quiz", () => {
    render(
      <StudentQuizPanel
        quizzes={[
          {
            ...quizzes[0],
            completed: true,
            score: 1,
            submittedAt: "2026-01-02T00:00:00Z",
            quizDeleted: true,
          },
        ]}
      />,
    );

    // The quiz itself is gone - there's nothing left to review, so this
    // must not be a clickable button (which would call getQuizReviewAction
    // with an attempt id instead of a real quiz id and fail).
    expect(
      screen.queryByRole("button", { name: /ανασκόπηση/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("1 / 1")).toBeInTheDocument();
  });

  it("shows the submission date instead of a class name for a deleted quiz", () => {
    render(
      <StudentQuizPanel
        quizzes={[
          {
            ...quizzes[0],
            className: "",
            completed: true,
            score: 1,
            submittedAt: "2026-01-02T00:00:00Z",
            quizDeleted: true,
          },
        ]}
      />,
    );

    expect(screen.getByText(/2 Ιανουαρίου 2026/i)).toBeInTheDocument();
  });

  it("loads and displays quiz questions when taking a quiz", async () => {
    const user = userEvent.setup();
    const getQuizForTakingAction = vi.mocked(
      quizActions.getQuizForTakingAction,
    );
    getQuizForTakingAction.mockResolvedValue(sampleQuizForTaking);

    render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /έναρξη τεστ/i }));

    await waitFor(() => {
      expect(screen.getByText(/2 \+ 2 = \?/)).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "4" })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "5" })).toBeInTheDocument();
    });
  });

  it("renders LaTeX math in a question when taking a quiz", async () => {
    const user = userEvent.setup();
    const getQuizForTakingAction = vi.mocked(
      quizActions.getQuizForTakingAction,
    );
    getQuizForTakingAction.mockResolvedValue({
      id: "quiz-1",
      title: "Chapter 3 Quiz",
      description: null,
      timeLimitMinutes: null,
      startedAt: null,
      questions: [
        {
          id: "q1",
          questionText: "Solve $x^2 = 4$ for x",
          questionType: "multiple_choice",
          orderIndex: 0,
          points: 1,
          imageUrl: null,
          options: [
            { id: "opt-1", optionText: "$x = 2$", orderIndex: 0 },
            { id: "opt-2", optionText: "$x = 3$", orderIndex: 1 },
          ],
        },
      ],
    });

    const { container } = render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /έναρξη τεστ/i }));

    await waitFor(() => {
      expect(container.querySelectorAll(".katex").length).toBeGreaterThan(0);
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
          imageUrl: null,
          selectedOptionId: "opt-1",
          selectedOptionText: "4",
          textAnswer: null,
          correctOptionId: "opt-1",
          correctOptionText: "4",
          isCorrect: true,
          pointsAwarded: 1,
          pointsPossible: 1,
        },
      ],
      attemptsUsed: 1,
      maxAttempts: null,
      canRetake: false,
      best: null,
    });

    render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /έναρξη τεστ/i }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "4" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("radio", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /υποβολή τεστ/i }));

    await waitFor(() => {
      expect(submitQuizAttemptAction).toHaveBeenCalledWith("quiz-1", [
        { questionId: "q1", selectedOptionId: "opt-1" },
      ]);
      expect(screen.getByText(/βαθμός: 1 \/ 1/i)).toBeInTheDocument();
      expect(screen.getByText(/σωστό/i)).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: /έναρξη τεστ/i }));

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: "4" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /υποβολή τεστ/i }));

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
          imageUrl: null,
          selectedOptionId: "opt-1",
          selectedOptionText: "4",
          textAnswer: null,
          correctOptionId: "opt-1",
          correctOptionText: "4",
          isCorrect: true,
          pointsAwarded: 1,
          pointsPossible: 1,
        },
      ],
      attemptsUsed: 1,
      maxAttempts: null,
      canRetake: false,
      best: null,
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

    await user.click(screen.getByRole("button", { name: /ανασκόπηση/i }));

    await waitFor(() => {
      expect(getQuizReviewAction).toHaveBeenCalledWith("quiz-1");
      expect(screen.getByText(/βαθμός: 1 \/ 1/i)).toBeInTheDocument();
    });
  });

  it("shows the first and best attempts as separate tabs, switching content on click", async () => {
    const user = userEvent.setup();
    const getQuizReviewAction = vi.mocked(quizActions.getQuizReviewAction);
    getQuizReviewAction.mockResolvedValue({
      attemptId: "attempt-1",
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      score: 0,
      maxScore: 1,
      submittedAt: "2026-01-01T00:00:00Z",
      answers: [
        {
          questionId: "q1",
          questionText: "2 + 2 = ?",
          questionType: "multiple_choice",
          imageUrl: null,
          selectedOptionId: "opt-2",
          selectedOptionText: "Wrong first answer",
          textAnswer: null,
          correctOptionId: "opt-1",
          correctOptionText: "4",
          isCorrect: false,
          pointsAwarded: 0,
          pointsPossible: 1,
        },
      ],
      attemptsUsed: 2,
      maxAttempts: null,
      canRetake: true,
      best: {
        score: 1,
        submittedAt: "2026-01-03T00:00:00Z",
        answers: [
          {
            questionId: "q1",
            questionText: "2 + 2 = ?",
            questionType: "multiple_choice",
            imageUrl: null,
            selectedOptionId: "opt-1",
            selectedOptionText: "Correct best answer",
            textAnswer: null,
            correctOptionId: "opt-1",
            correctOptionText: "4",
            isCorrect: true,
            pointsAwarded: 1,
            pointsPossible: 1,
          },
        ],
      },
    });

    render(
      <StudentQuizPanel
        quizzes={[
          {
            ...quizzes[0],
            completed: true,
            score: 0,
            bestScore: 1,
            attemptsUsed: 2,
            canRetake: true,
            submittedAt: "2026-01-01T00:00:00Z",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /ανασκόπηση/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: /πρώτη προσπάθεια/i }),
      ).toBeInTheDocument();
    });

    // The first tab is active by default, and its attempt was wrong.
    expect(screen.getByText("Λάθος")).toBeInTheDocument();
    expect(screen.queryByText("Σωστό")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("tab", { name: /καλύτερη προσπάθεια/i }),
    );

    // The best attempt was correct, and the first attempt's panel is gone.
    await waitFor(() => {
      expect(screen.getByText("Σωστό")).toBeInTheDocument();
      expect(screen.queryByText("Λάθος")).not.toBeInTheDocument();
    });
  });

  it("renders a true/false question with True/False options when taking a quiz", async () => {
    const user = userEvent.setup();
    const getQuizForTakingAction = vi.mocked(
      quizActions.getQuizForTakingAction,
    );
    getQuizForTakingAction.mockResolvedValue({
      id: "quiz-1",
      title: "Chapter 3 Quiz",
      description: null,
      timeLimitMinutes: null,
      startedAt: null,
      questions: [
        {
          id: "q1",
          questionText: "The sky is green",
          questionType: "true_false",
          orderIndex: 0,
          points: 1,
          imageUrl: null,
          options: [
            { id: "opt-true", optionText: "True", orderIndex: 0 },
            { id: "opt-false", optionText: "False", orderIndex: 1 },
          ],
        },
      ],
    });

    render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /έναρξη τεστ/i }));

    await waitFor(() => {
      expect(screen.getByText(/the sky is green/i)).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: "True" })).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: "False" }),
      ).toBeInTheDocument();
    });
  });

  it("renders a short answer question with a text input when taking a quiz", async () => {
    const user = userEvent.setup();
    const getQuizForTakingAction = vi.mocked(
      quizActions.getQuizForTakingAction,
    );
    getQuizForTakingAction.mockResolvedValue({
      id: "quiz-1",
      title: "Chapter 3 Quiz",
      description: null,
      timeLimitMinutes: null,
      startedAt: null,
      questions: [
        {
          id: "q1",
          questionText: "Explain your reasoning",
          questionType: "short_answer",
          orderIndex: 0,
          points: 1,
          imageUrl: null,
          options: [],
        },
      ],
    });

    render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /έναρξη τεστ/i }));

    await waitFor(() => {
      expect(screen.getByText(/explain your reasoning/i)).toBeInTheDocument();
      expect(
        screen.getByPlaceholderText(/η απάντησή σας/i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("shows an awaiting-review badge for short-answer questions in the review", async () => {
    const user = userEvent.setup();
    const getQuizReviewAction = vi.mocked(quizActions.getQuizReviewAction);
    getQuizReviewAction.mockResolvedValue({
      attemptId: "attempt-1",
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      score: 0,
      maxScore: 1,
      submittedAt: "2026-01-02T00:00:00Z",
      answers: [
        {
          questionId: "q1",
          questionText: "Explain your reasoning",
          questionType: "short_answer",
          imageUrl: null,
          selectedOptionId: null,
          selectedOptionText: null,
          textAnswer: "Because $4 minus $2 leaves $2 left over",
          correctOptionId: null,
          correctOptionText: null,
          isCorrect: null,
          pointsAwarded: null,
          pointsPossible: 1,
        },
      ],
      attemptsUsed: 1,
      maxAttempts: null,
      canRetake: false,
      best: null,
    });

    const { container } = render(
      <StudentQuizPanel
        quizzes={[
          {
            ...quizzes[0],
            completed: true,
            score: 0,
            submittedAt: "2026-01-02T00:00:00Z",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /ανασκόπηση/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/because \$4 minus \$2 leaves \$2 left over/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/εκκρεμεί βαθμολόγηση/i),
      ).toBeInTheDocument();
      // The student's own free-text answer must never be run through the
      // math renderer, even though it contains literal "$" characters.
      expect(container.querySelector(".katex")).toBeNull();
    });
  });

  it("shows a countdown for a quiz with a time limit", async () => {
    const user = userEvent.setup();
    const getQuizForTakingAction = vi.mocked(
      quizActions.getQuizForTakingAction,
    );
    getQuizForTakingAction.mockResolvedValue({
      ...sampleQuizForTaking,
      timeLimitMinutes: 1,
      startedAt: new Date(Date.now() - 55_000).toISOString(),
    });

    render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /έναρξη τεστ/i }));

    await waitFor(() => {
      expect(screen.getByText(/^0:0[0-9]$/)).toBeInTheDocument();
    });
  });

  it("auto-submits with a time's-up message once the time limit has elapsed", async () => {
    const user = userEvent.setup();
    const getQuizForTakingAction = vi.mocked(
      quizActions.getQuizForTakingAction,
    );
    const submitQuizAttemptAction = vi.mocked(
      quizActions.submitQuizAttemptAction,
    );

    getQuizForTakingAction.mockResolvedValue({
      ...sampleQuizForTaking,
      timeLimitMinutes: 1,
      startedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
    });
    submitQuizAttemptAction.mockResolvedValue({
      attemptId: "attempt-1",
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      score: 0,
      maxScore: 1,
      submittedAt: "2026-01-02T00:00:00Z",
      answers: [],
      attemptsUsed: 1,
      maxAttempts: null,
      canRetake: false,
      best: null,
    });

    render(<StudentQuizPanel quizzes={quizzes} />);
    await user.click(screen.getByRole("button", { name: /έναρξη τεστ/i }));

    await waitFor(() => {
      expect(submitQuizAttemptAction).toHaveBeenCalledWith("quiz-1", []);
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Ο χρόνος τελείωσε — το τεστ υποβλήθηκε αυτόματα",
    );
  });
});
