import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TeacherQuizBuilder } from "@/components/teacher-quiz-builder";
import * as quizActions from "@/app/protected/teacher/quiz-actions";

vi.mock("@/app/protected/teacher/quiz-actions", () => ({
  createQuizAction: vi.fn(),
  getQuizResultsAction: vi.fn(),
  getStudentQuizAttemptAction: vi.fn(),
  assignQuizToClassAction: vi.fn(),
  unassignQuizFromClassAction: vi.fn(),
  getQuizForEditingAction: vi.fn(),
  updateQuizAction: vi.fn(),
  duplicateQuizAction: vi.fn(),
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

const baseQuiz = {
  id: "quiz-1",
  assignedClasses: [{ id: "class-1", name: "Algebra II" }],
  title: "Chapter 3 Quiz",
  description: null,
  questionCount: 1,
  hasAttempts: false,
  createdAt: "2026-01-01T00:00:00Z",
};

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

  it("creates a quiz with no classes assigned", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);
    createQuizAction.mockResolvedValue({
      id: "quiz-1",
      assignedClasses: [],
      title: "Chapter 3 Quiz",
      description: null,
      questionCount: 1,
      hasAttempts: false,
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
          classIds: [],
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
      expect(screen.getByText("Unassigned")).toBeInTheDocument();
    });
  });

  it("creates a quiz assigned to multiple classes in one step", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);
    createQuizAction.mockResolvedValue({
      id: "quiz-1",
      assignedClasses: [
        { id: "class-1", name: "Algebra II" },
        { id: "class-2", name: "Biology" },
      ],
      title: "Chapter 3 Quiz",
      description: null,
      questionCount: 1,
      hasAttempts: false,
      createdAt: "2026-01-01T00:00:00Z",
    });

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    await user.type(screen.getByLabelText(/title/i), "Chapter 3 Quiz");
    await user.type(screen.getByPlaceholderText(/question text/i), "2+2=?");
    await user.type(screen.getByPlaceholderText(/option 1/i), "4");
    await user.type(screen.getByPlaceholderText(/option 2/i), "5");
    await user.click(screen.getByRole("checkbox", { name: "Algebra II" }));
    await user.click(screen.getByRole("checkbox", { name: "Biology" }));
    await user.click(screen.getByRole("button", { name: /create quiz/i }));

    await waitFor(() => {
      expect(createQuizAction).toHaveBeenCalledWith(
        expect.objectContaining({
          classIds: ["class-1", "class-2"],
        }),
      );
      expect(screen.getByText("Algebra II, Biology")).toBeInTheDocument();
    });
  });

  it("creates a quiz with a true/false question", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);
    createQuizAction.mockResolvedValue({
      id: "quiz-2",
      assignedClasses: [],
      title: "True/False Quiz",
      description: null,
      questionCount: 1,
      hasAttempts: false,
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
      assignedClasses: [],
      title: "Short Answer Quiz",
      description: null,
      questionCount: 1,
      hasAttempts: false,
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
      <TeacherQuizBuilder classes={classes} initialQuizzes={[baseQuiz]} />,
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
      <TeacherQuizBuilder classes={classes} initialQuizzes={[baseQuiz]} />,
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

  it("assigns and unassigns a class from the list view", async () => {
    const user = userEvent.setup();
    const assignQuizToClassAction = vi.mocked(
      quizActions.assignQuizToClassAction,
    );
    const unassignQuizFromClassAction = vi.mocked(
      quizActions.unassignQuizFromClassAction,
    );
    assignQuizToClassAction.mockResolvedValue(undefined);
    unassignQuizFromClassAction.mockResolvedValue(undefined);

    render(
      <TeacherQuizBuilder classes={classes} initialQuizzes={[baseQuiz]} />,
    );

    await user.click(screen.getByRole("button", { name: /manage classes/i }));

    const dialog = screen.getByRole("dialog");

    const biologyCheckbox = within(dialog).getByRole("checkbox", {
      name: "Biology",
    });
    await user.click(biologyCheckbox);
    await waitFor(() => {
      expect(assignQuizToClassAction).toHaveBeenCalledWith(
        "quiz-1",
        "class-2",
      );
    });

    const algebraCheckbox = within(dialog).getByRole("checkbox", {
      name: "Algebra II",
    });
    await user.click(algebraCheckbox);
    await waitFor(() => {
      expect(unassignQuizFromClassAction).toHaveBeenCalledWith(
        "quiz-1",
        "class-1",
      );
    });
  });

  it("edits an unlocked quiz's title and questions", async () => {
    const user = userEvent.setup();
    const getQuizForEditingAction = vi.mocked(
      quizActions.getQuizForEditingAction,
    );
    const updateQuizAction = vi.mocked(quizActions.updateQuizAction);

    getQuizForEditingAction.mockResolvedValue({
      id: "quiz-1",
      title: "Chapter 3 Quiz",
      description: null,
      locked: false,
      assignedClassIds: ["class-1"],
      questions: [
        {
          questionText: "2+2=?",
          questionType: "multiple_choice",
          points: 1,
          options: [
            { optionText: "4", isCorrect: true },
            { optionText: "5", isCorrect: false },
          ],
        },
      ],
    });
    updateQuizAction.mockResolvedValue({
      ...baseQuiz,
      title: "Chapter 3 Quiz (updated)",
    });

    render(
      <TeacherQuizBuilder classes={classes} initialQuizzes={[baseQuiz]} />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(within(dialog).getByDisplayValue("Chapter 3 Quiz")).toBeInTheDocument();
    });

    const titleInput = within(dialog).getByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Chapter 3 Quiz (updated)");
    await user.click(
      within(dialog).getByRole("button", { name: /save changes/i }),
    );

    await waitFor(() => {
      expect(updateQuizAction).toHaveBeenCalledWith(
        expect.objectContaining({
          quizId: "quiz-1",
          title: "Chapter 3 Quiz (updated)",
          questions: expect.arrayContaining([
            expect.objectContaining({ questionText: "2+2=?" }),
          ]),
        }),
      );
      expect(
        screen.getByText("Chapter 3 Quiz (updated)"),
      ).toBeInTheDocument();
    });
  });

  it("locks the question editor for a quiz with attempts, but keeps title/description editable", async () => {
    const user = userEvent.setup();
    const getQuizForEditingAction = vi.mocked(
      quizActions.getQuizForEditingAction,
    );
    const updateQuizAction = vi.mocked(quizActions.updateQuizAction);

    const lockedQuiz = { ...baseQuiz, hasAttempts: true };

    getQuizForEditingAction.mockResolvedValue({
      id: "quiz-1",
      title: "Chapter 3 Quiz",
      description: null,
      locked: true,
      assignedClassIds: ["class-1"],
      questions: [
        {
          questionText: "2+2=?",
          questionType: "multiple_choice",
          points: 1,
          options: [
            { optionText: "4", isCorrect: true },
            { optionText: "5", isCorrect: false },
          ],
        },
      ],
    });
    updateQuizAction.mockResolvedValue(lockedQuiz);

    render(
      <TeacherQuizBuilder classes={classes} initialQuizzes={[lockedQuiz]} />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(
        within(dialog).getByText(/questions are locked/i),
      ).toBeInTheDocument();
    });

    expect(
      within(dialog).getByPlaceholderText(/question text/i),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole("button", { name: /copy to edit/i }),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /save changes/i }),
    );

    await waitFor(() => {
      expect(updateQuizAction).toHaveBeenCalledWith(
        expect.objectContaining({
          quizId: "quiz-1",
          questions: undefined,
        }),
      );
    });
  });

  it("copies a quiz into a new, unassigned and unlocked entry", async () => {
    const user = userEvent.setup();
    const duplicateQuizAction = vi.mocked(quizActions.duplicateQuizAction);
    duplicateQuizAction.mockResolvedValue({
      id: "quiz-2",
      assignedClasses: [],
      title: "Chapter 3 Quiz (copy)",
      description: null,
      questionCount: 1,
      hasAttempts: false,
      createdAt: "2026-01-03T00:00:00Z",
    });

    render(
      <TeacherQuizBuilder
        classes={classes}
        initialQuizzes={[{ ...baseQuiz, hasAttempts: true }]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^copy$/i }));

    await waitFor(() => {
      expect(duplicateQuizAction).toHaveBeenCalledWith("quiz-1");
      expect(screen.getByText("Chapter 3 Quiz (copy)")).toBeInTheDocument();
      expect(screen.getAllByText("Unassigned").length).toBeGreaterThan(0);
    });
  });
});
