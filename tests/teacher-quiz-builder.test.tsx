import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TeacherQuizBuilder } from "@/components/teacher-quiz-builder";
import * as quizActions from "@/app/protected/teacher/quiz-actions";

vi.mock("@/app/protected/teacher/quiz-actions", () => ({
  createQuizAction: vi.fn(),
  getQuizResultsAction: vi.fn(),
  getStudentQuizAttemptAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

const classes = [
  { id: "class-1", name: "Algebra II" },
  { id: "class-2", name: "Biology" },
];

describe("TeacherQuizBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the create quiz form with one blank question by default", () => {
    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByText(/question 1/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create quiz/i }),
    ).toBeInTheDocument();
  });

  it("adds and removes question rows", async () => {
    const user = userEvent.setup();
    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    await user.click(screen.getByRole("button", { name: /add question/i }));
    expect(screen.getByText(/question 2/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /remove question 2/i }),
    );
    expect(screen.queryByText(/question 2/i)).not.toBeInTheDocument();
  });

  it("adds and removes option rows for a multiple choice question", async () => {
    const user = userEvent.setup();
    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    expect(screen.getByPlaceholderText(/option 1/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/option 2/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add option/i }));
    expect(screen.getByPlaceholderText(/option 3/i)).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /remove option 3/i }),
    );
    expect(
      screen.queryByPlaceholderText(/option 3/i),
    ).not.toBeInTheDocument();
  });

  it("shows a toast when submitting without a title", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    await user.type(screen.getByPlaceholderText(/question text/i), "2+2=?");
    await user.type(screen.getByPlaceholderText(/option 1/i), "4");
    await user.type(screen.getByPlaceholderText(/option 2/i), "5");
    await user.click(screen.getByRole("button", { name: /create quiz/i }));

    expect(toast.error).toHaveBeenCalledWith("Give the quiz a title");
    expect(createQuizAction).not.toHaveBeenCalled();
  });

  it("creates a quiz with valid data and adds it to the list", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);
    createQuizAction.mockResolvedValue({
      id: "quiz-1",
      classId: "class-1",
      className: "Algebra II",
      title: "Chapter 3 Quiz",
      description: null,
      questionCount: 1,
      createdAt: "2026-01-01T00:00:00Z",
    });

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    await user.type(screen.getByLabelText(/title/i), "Chapter 3 Quiz");
    await user.type(screen.getByPlaceholderText(/question text/i), "2+2=?");
    await user.type(screen.getByPlaceholderText(/option 1/i), "4");
    await user.type(screen.getByPlaceholderText(/option 2/i), "5");
    // Option 1 is correct by default - no need to change it.
    await user.click(screen.getByRole("button", { name: /create quiz/i }));

    await waitFor(() => {
      expect(createQuizAction).toHaveBeenCalledWith(
        expect.objectContaining({
          classId: "class-1",
          title: "Chapter 3 Quiz",
          questions: [
            expect.objectContaining({
              questionText: "2+2=?",
              questionType: "multiple_choice",
              options: [
                { optionText: "4", isCorrect: true },
                { optionText: "5", isCorrect: false },
              ],
            }),
          ],
        }),
      );
      expect(screen.getByText("Chapter 3 Quiz")).toBeInTheDocument();
    });
  });

  it("creates a quiz with a true/false question", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);
    createQuizAction.mockResolvedValue({
      id: "quiz-2",
      classId: "class-1",
      className: "Algebra II",
      title: "True/False Quiz",
      description: null,
      questionCount: 1,
      createdAt: "2026-01-01T00:00:00Z",
    });

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    await user.type(screen.getByLabelText(/title/i), "True/False Quiz");
    await user.type(
      screen.getByPlaceholderText(/question text/i),
      "The sky is green",
    );
    await user.selectOptions(
      screen.getByLabelText(/question type/i),
      "true_false",
    );
    await user.click(screen.getByRole("radio", { name: "False" }));
    await user.click(screen.getByRole("button", { name: /create quiz/i }));

    await waitFor(() => {
      expect(createQuizAction).toHaveBeenCalledWith(
        expect.objectContaining({
          questions: [
            expect.objectContaining({
              questionText: "The sky is green",
              questionType: "true_false",
              options: [
                { optionText: "True", isCorrect: false },
                { optionText: "False", isCorrect: true },
              ],
            }),
          ],
        }),
      );
    });
  });

  it("creates a quiz with a short answer question", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);
    createQuizAction.mockResolvedValue({
      id: "quiz-3",
      classId: "class-1",
      className: "Algebra II",
      title: "Short Answer Quiz",
      description: null,
      questionCount: 1,
      createdAt: "2026-01-01T00:00:00Z",
    });

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    await user.type(screen.getByLabelText(/title/i), "Short Answer Quiz");
    await user.type(
      screen.getByPlaceholderText(/question text/i),
      "Explain your reasoning",
    );
    await user.selectOptions(
      screen.getByLabelText(/question type/i),
      "short_answer",
    );

    expect(
      screen.getByText(/students will type a free-text answer/i),
    ).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/option 1/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /create quiz/i }));

    await waitFor(() => {
      expect(createQuizAction).toHaveBeenCalledWith(
        expect.objectContaining({
          questions: [
            expect.objectContaining({
              questionText: "Explain your reasoning",
              questionType: "short_answer",
              options: [],
            }),
          ],
        }),
      );
    });
  });

  it("shows per-student results when a quiz is selected", async () => {
    const user = userEvent.setup();
    const getQuizResultsAction = vi.mocked(quizActions.getQuizResultsAction);
    getQuizResultsAction.mockResolvedValue({
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      results: [
        {
          studentId: "student-1",
          studentName: "Maya Carter",
          completed: true,
          score: 4,
          maxScore: 5,
          submittedAt: "2026-01-02T00:00:00Z",
          pendingShortAnswerCount: 0,
        },
      ],
    });

    render(
      <TeacherQuizBuilder
        classes={classes}
        initialQuizzes={[
          {
            id: "quiz-1",
            classId: "class-1",
            className: "Algebra II",
            title: "Chapter 3 Quiz",
            description: null,
            questionCount: 1,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ]}
      />,
    );

    await user.click(screen.getByText("Chapter 3 Quiz"));

    await waitFor(() => {
      expect(screen.getByText("Maya Carter")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /4 \/ 5.*view answers/i }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /back to quizzes/i }),
    );
    expect(
      screen.getByRole("button", { name: /create quiz/i }),
    ).toBeInTheDocument();
  });

  it("shows a student's answers when View answers is clicked", async () => {
    const user = userEvent.setup();
    const getQuizResultsAction = vi.mocked(quizActions.getQuizResultsAction);
    const getStudentQuizAttemptAction = vi.mocked(
      quizActions.getStudentQuizAttemptAction,
    );

    getQuizResultsAction.mockResolvedValue({
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      results: [
        {
          studentId: "student-1",
          studentName: "Maya Carter",
          completed: true,
          score: 1,
          maxScore: 1,
          submittedAt: "2026-01-02T00:00:00Z",
          pendingShortAnswerCount: 0,
        },
      ],
    });

    getStudentQuizAttemptAction.mockResolvedValue({
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
          selectedOptionText: "4",
          textAnswer: null,
          correctOptionId: "opt-1",
          correctOptionText: "4",
          isCorrect: true,
          pointsAwarded: 1,
          pointsPossible: 1,
        },
      ],
    });

    render(
      <TeacherQuizBuilder
        classes={classes}
        initialQuizzes={[
          {
            id: "quiz-1",
            classId: "class-1",
            className: "Algebra II",
            title: "Chapter 3 Quiz",
            description: null,
            questionCount: 1,
            createdAt: "2026-01-01T00:00:00Z",
          },
        ]}
      />,
    );

    await user.click(screen.getByText("Chapter 3 Quiz"));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /1 \/ 1.*view answers/i }),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /1 \/ 1.*view answers/i }),
    );

    await waitFor(() => {
      expect(getStudentQuizAttemptAction).toHaveBeenCalledWith(
        "quiz-1",
        "student-1",
      );
      expect(screen.getByText(/maya carter.*answers/i)).toBeInTheDocument();
      expect(screen.getByText(/2 \+ 2 = \?/)).toBeInTheDocument();
      expect(screen.getByText("Selected: 4")).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /back to results/i }),
    );
    expect(screen.getByText("Maya Carter")).toBeInTheDocument();
  });
});
