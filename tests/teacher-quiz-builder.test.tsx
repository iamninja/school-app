import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TeacherQuizBuilder } from "@/components/teacher-quiz-builder";
import * as quizActions from "@/app/protected/teacher/quiz-actions";
import { createClient as createBrowserClient } from "@/lib/supabase/client";

vi.mock("@/app/protected/teacher/quiz-actions", () => ({
  createQuizAction: vi.fn(),
  deleteQuizAction: vi.fn(),
  getQuizResultsAction: vi.fn(),
  getStudentQuizAttemptAction: vi.fn(),
  assignQuizToClassAction: vi.fn(),
  unassignQuizFromClassAction: vi.fn(),
  getQuizForEditingAction: vi.fn(),
  updateQuizAction: vi.fn(),
  duplicateQuizAction: vi.fn(),
  getQuizQuestionBreakdownAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(),
}));

const classes = [
  { id: "class-1", name: "Algebra II" },
  { id: "class-2", name: "Biology" },
];

const baseQuiz = {
  id: "quiz-1",
  assignedClasses: [
    { id: "class-1", name: "Algebra II", shuffleQuestions: false },
  ],
  title: "Chapter 3 Quiz",
  description: null,
  timeLimitMinutes: null,
  questionCount: 1,
  hasAttempts: false,
  createdAt: "2026-01-01T00:00:00Z",
};

async function openCreateDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /new quiz/i }));
  await screen.findByRole("dialog");
}

describe("TeacherQuizBuilder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the create quiz form hidden behind a New quiz button by default", () => {
    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    expect(
      screen.getByRole("button", { name: /new quiz/i }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/title/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/question 1/i)).not.toBeInTheDocument();
  });

  it("opens the create quiz form with one blank question when New quiz is clicked", async () => {
    const user = userEvent.setup();
    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

    await openCreateDialog(user);

    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByText(/question 1/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create quiz/i }),
    ).toBeInTheDocument();
  });

  it("adds and removes question rows", async () => {
    const user = userEvent.setup();
    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
    await openCreateDialog(user);

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
    await openCreateDialog(user);

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

  it("shows and hides a live LaTeX preview under the question text as it's typed", async () => {
    const user = userEvent.setup();
    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
    await openCreateDialog(user);

    // The dialog portals its content to document.body, outside the
    // container render() returns, so query the document directly.
    const questionInput = screen.getByPlaceholderText(/question text/i);
    expect(document.querySelector(".katex")).toBeNull();

    await user.type(questionInput, "Solve $x^2$");
    await waitFor(() => {
      expect(document.querySelector(".katex")).not.toBeNull();
    });

    await user.clear(questionInput);
    await waitFor(() => {
      expect(document.querySelector(".katex")).toBeNull();
    });
  });

  it("shows a live LaTeX preview under the quiz title and description as they're typed", async () => {
    const user = userEvent.setup();
    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
    await openCreateDialog(user);

    expect(document.querySelector(".katex")).toBeNull();

    await user.type(screen.getByLabelText(/^title$/i), "Unit $x^2$ Review");
    await waitFor(() => {
      expect(document.querySelectorAll(".katex").length).toBe(1);
    });

    await user.type(
      screen.getByLabelText(/description/i),
      "Covers $\\sqrt{x}$",
    );
    await waitFor(() => {
      expect(document.querySelectorAll(".katex").length).toBe(2);
    });
  });

  it("shows a toast when submitting without a title", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
    await openCreateDialog(user);

    await user.type(screen.getByPlaceholderText(/question text/i), "2+2=?");
    await user.type(screen.getByPlaceholderText(/option 1/i), "4");
    await user.type(screen.getByPlaceholderText(/option 2/i), "5");
    await user.click(screen.getByRole("button", { name: /create quiz/i }));

    expect(toast.error).toHaveBeenCalledWith("Give the quiz a title");
    expect(createQuizAction).not.toHaveBeenCalled();
  });

  it("creates a quiz with a time limit and shows the badge in the list", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);
    createQuizAction.mockResolvedValue({
      ...baseQuiz,
      id: "quiz-1",
      timeLimitMinutes: 15,
    });

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
    await openCreateDialog(user);

    await user.type(screen.getByLabelText(/^title$/i), "Chapter 3 Quiz");
    await user.type(screen.getByPlaceholderText(/question text/i), "2+2=?");
    await user.type(screen.getByPlaceholderText(/option 1/i), "4");
    await user.type(screen.getByPlaceholderText(/option 2/i), "5");
    await user.type(screen.getByLabelText(/time limit/i), "15");
    await user.click(screen.getByRole("button", { name: /create quiz/i }));

    await waitFor(() => {
      expect(createQuizAction).toHaveBeenCalledWith(
        expect.objectContaining({ timeLimitMinutes: 15 }),
      );
      expect(screen.getByText("⏱ 15 min")).toBeInTheDocument();
    });
  });

  it("omits the time limit badge for a quiz with no time limit set", () => {
    render(
      <TeacherQuizBuilder
        classes={classes}
        initialQuizzes={[{ ...baseQuiz, timeLimitMinutes: null }]}
      />,
    );
    expect(screen.queryByText(/⏱/)).not.toBeInTheDocument();
  });

  it("creates a quiz with no classes assigned", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);
    createQuizAction.mockResolvedValue({
      id: "quiz-1",
      assignedClasses: [],
      title: "Chapter 3 Quiz",
      description: null,
      timeLimitMinutes: null,
      questionCount: 1,
      hasAttempts: false,
      createdAt: "2026-01-01T00:00:00Z",
    });

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
    await openCreateDialog(user);

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
      const quizRow = screen
        .getByText("Chapter 3 Quiz")
        .closest(".rounded-md") as HTMLElement;
      expect(within(quizRow).getByText("Unassigned")).toBeInTheDocument();
    });
  });

  it("creates a quiz assigned to multiple classes in one step", async () => {
    const user = userEvent.setup();
    const createQuizAction = vi.mocked(quizActions.createQuizAction);
    createQuizAction.mockResolvedValue({
      id: "quiz-1",
      assignedClasses: [
        { id: "class-1", name: "Algebra II", shuffleQuestions: false },
        { id: "class-2", name: "Biology", shuffleQuestions: false },
      ],
      title: "Chapter 3 Quiz",
      description: null,
      timeLimitMinutes: null,
      questionCount: 1,
      hasAttempts: false,
      createdAt: "2026-01-01T00:00:00Z",
    });

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
    await openCreateDialog(user);

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
      timeLimitMinutes: null,
      questionCount: 1,
      hasAttempts: false,
      createdAt: "2026-01-01T00:00:00Z",
    });

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
    await openCreateDialog(user);

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
      timeLimitMinutes: null,
      questionCount: 1,
      hasAttempts: false,
      createdAt: "2026-01-01T00:00:00Z",
    });

    render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
    await openCreateDialog(user);

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

  it("renders LaTeX in a quiz title in the Your Quizzes list", () => {
    const { container } = render(
      <TeacherQuizBuilder
        classes={classes}
        initialQuizzes={[{ ...baseQuiz, title: "Solving $x^2 = 4$" }]}
      />,
    );

    expect(container.querySelector(".katex")).not.toBeNull();
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
      screen.getByRole("button", { name: /new quiz/i }),
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
      timeLimitMinutes: null,
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
          imagePath: null,
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

  it("edits a quiz's time limit", async () => {
    const user = userEvent.setup();
    const getQuizForEditingAction = vi.mocked(
      quizActions.getQuizForEditingAction,
    );
    const updateQuizAction = vi.mocked(quizActions.updateQuizAction);

    getQuizForEditingAction.mockResolvedValue({
      id: "quiz-1",
      title: "Chapter 3 Quiz",
      description: null,
      timeLimitMinutes: null,
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
          imagePath: null,
        },
      ],
    });
    updateQuizAction.mockResolvedValue({
      ...baseQuiz,
      timeLimitMinutes: 20,
    });

    render(
      <TeacherQuizBuilder classes={classes} initialQuizzes={[baseQuiz]} />,
    );

    await user.click(screen.getByRole("button", { name: /^edit$/i }));

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(
        within(dialog).getByDisplayValue("Chapter 3 Quiz"),
      ).toBeInTheDocument();
    });

    await user.type(within(dialog).getByLabelText(/time limit/i), "20");
    await user.click(
      within(dialog).getByRole("button", { name: /save changes/i }),
    );

    await waitFor(() => {
      expect(updateQuizAction).toHaveBeenCalledWith(
        expect.objectContaining({ quizId: "quiz-1", timeLimitMinutes: 20 }),
      );
      expect(screen.getByText("⏱ 20 min")).toBeInTheDocument();
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
      timeLimitMinutes: null,
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
          imagePath: null,
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
      timeLimitMinutes: null,
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

  it("deletes a quiz after confirming, and does nothing if cancelled", async () => {
    const user = userEvent.setup();
    const deleteQuizAction = vi.mocked(quizActions.deleteQuizAction);
    deleteQuizAction.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm");

    render(
      <TeacherQuizBuilder
        classes={classes}
        initialQuizzes={[{ ...baseQuiz, hasAttempts: true }]}
      />,
    );

    confirmSpy.mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    expect(deleteQuizAction).not.toHaveBeenCalled();
    expect(screen.getByText("Chapter 3 Quiz")).toBeInTheDocument();

    confirmSpy.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: /^delete$/i }));
    await waitFor(() => {
      expect(deleteQuizAction).toHaveBeenCalledWith("quiz-1");
    });
    expect(screen.queryByText("Chapter 3 Quiz")).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("shows a per-question answer distribution and each student's answer", async () => {
    const user = userEvent.setup();
    const getQuizQuestionBreakdownAction = vi.mocked(
      quizActions.getQuizQuestionBreakdownAction,
    );

    getQuizQuestionBreakdownAction.mockResolvedValue({
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      questions: [
        {
          questionId: "q1",
          questionText: "2 + 2 = ?",
          questionType: "multiple_choice",
          points: 1,
          imageUrl: null,
          optionBreakdown: [
            { optionId: "opt-1", optionText: "4", isCorrect: true, count: 2 },
            { optionId: "opt-2", optionText: "5", isCorrect: false, count: 1 },
          ],
          studentAnswers: [
            {
              studentId: "student-1",
              studentName: "Ava Chen",
              selectedOptionText: "4",
              textAnswer: null,
              isCorrect: true,
            },
            {
              studentId: "student-2",
              studentName: "Maya Carter",
              selectedOptionText: "5",
              textAnswer: null,
              isCorrect: false,
            },
            {
              studentId: "student-3",
              studentName: "Noah Diaz",
              selectedOptionText: "4",
              textAnswer: null,
              isCorrect: true,
            },
          ],
        },
      ],
    });

    render(
      <TeacherQuizBuilder classes={classes} initialQuizzes={[baseQuiz]} />,
    );

    await user.click(
      screen.getByRole("button", { name: /question breakdown/i }),
    );

    await waitFor(() => {
      expect(getQuizQuestionBreakdownAction).toHaveBeenCalledWith("quiz-1");
      expect(screen.getByText("1. 2 + 2 = ?")).toBeInTheDocument();
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
      expect(screen.getByText("Ava Chen")).toBeInTheDocument();
      expect(screen.getByText("Maya Carter")).toBeInTheDocument();
      expect(screen.getByText("Noah Diaz")).toBeInTheDocument();
    });
  });

  it("shows an awaiting-review badge for short-answer questions in the breakdown, with no option distribution", async () => {
    const user = userEvent.setup();
    const getQuizQuestionBreakdownAction = vi.mocked(
      quizActions.getQuizQuestionBreakdownAction,
    );

    getQuizQuestionBreakdownAction.mockResolvedValue({
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      questions: [
        {
          questionId: "q1",
          questionText: "Explain your reasoning",
          questionType: "short_answer",
          points: 1,
          imageUrl: null,
          optionBreakdown: [],
          studentAnswers: [
            {
              studentId: "student-1",
              studentName: "Ava Chen",
              selectedOptionText: null,
              textAnswer: "Because math",
              isCorrect: null,
            },
          ],
        },
      ],
    });

    render(
      <TeacherQuizBuilder classes={classes} initialQuizzes={[baseQuiz]} />,
    );

    await user.click(
      screen.getByRole("button", { name: /question breakdown/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Because math")).toBeInTheDocument();
      expect(screen.getByText("Awaiting review")).toBeInTheDocument();
      expect(screen.queryByText(/\d \/ \d/)).not.toBeInTheDocument();
    });
  });

  it("renders LaTeX for teacher-authored option text in the breakdown, but never for a student's own short answer", async () => {
    const user = userEvent.setup();
    const getQuizQuestionBreakdownAction = vi.mocked(
      quizActions.getQuizQuestionBreakdownAction,
    );

    getQuizQuestionBreakdownAction.mockResolvedValue({
      quizId: "quiz-1",
      quizTitle: "Chapter 3 Quiz",
      questions: [
        {
          questionId: "q1",
          questionText: "Area of a circle?",
          questionType: "multiple_choice",
          points: 1,
          imageUrl: null,
          optionBreakdown: [
            {
              optionId: "opt-1",
              optionText: "$\\pi r^2$",
              isCorrect: true,
              count: 1,
            },
          ],
          studentAnswers: [
            {
              studentId: "student-1",
              studentName: "Ava Chen",
              selectedOptionText: "$\\pi r^2$",
              textAnswer: null,
              isCorrect: true,
            },
          ],
        },
        {
          questionId: "q2",
          questionText: "Explain your reasoning",
          questionType: "short_answer",
          points: 1,
          imageUrl: null,
          optionBreakdown: [],
          studentAnswers: [
            {
              studentId: "student-2",
              studentName: "Maya Carter",
              selectedOptionText: null,
              textAnswer: "I used $2 worth of pi",
              isCorrect: null,
            },
          ],
        },
      ],
    });

    const { container } = render(
      <TeacherQuizBuilder classes={classes} initialQuizzes={[baseQuiz]} />,
    );

    await user.click(
      screen.getByRole("button", { name: /question breakdown/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/i used \$2 worth of pi/i)).toBeInTheDocument();
    });

    // Two .katex nodes for the teacher-authored option text: one in the
    // distribution row, one in Ava's per-student answer row. Maya's own
    // short-answer text is never run through the renderer even though it
    // contains a literal "$".
    expect(container.querySelectorAll(".katex").length).toBe(2);
  });

  describe("importing a quiz from a Markdown file", () => {
    it("parses a valid file and opens the create dialog pre-filled", async () => {
      const user = userEvent.setup();
      render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

      const file = new File(
        [
          [
            "# Chapter 3 Quiz",
            "",
            "Covers derivatives.",
            "",
            "Time limit: 15",
            "",
            "## What is 2+2?",
            "- [ ] 3",
            "- [x] 4",
          ].join("\n"),
        ],
        "quiz.md",
        { type: "text/markdown" },
      );

      await user.upload(
        screen.getByLabelText(/import quiz from file/i),
        file,
      );

      await screen.findByRole("dialog");
      expect(screen.getByLabelText(/title/i)).toHaveValue("Chapter 3 Quiz");
      expect(screen.getByLabelText(/description/i)).toHaveValue(
        "Covers derivatives.",
      );
      expect(screen.getByLabelText(/time limit/i)).toHaveValue(15);
      expect(screen.getByDisplayValue("What is 2+2?")).toBeInTheDocument();
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringMatching(/imported 1 question/i),
      );
    });

    it("shows a friendly error and leaves the dialog closed for an invalid file", async () => {
      const user = userEvent.setup();
      render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);

      const file = new File(["Not a valid quiz file"], "quiz.md", {
        type: "text/markdown",
      });

      await user.upload(
        screen.getByLabelText(/import quiz from file/i),
        file,
      );

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringMatching(/no quiz title found/i),
        );
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("question images", () => {
    it("shows a preview after picking an image, and removes it on request", async () => {
      const user = userEvent.setup();
      render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
      await openCreateDialog(user);

      const file = new File(["fake-bytes"], "diagram.png", {
        type: "image/png",
      });
      await user.upload(screen.getByLabelText(/add image/i), file);

      expect(await screen.findByAltText(/question image/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /remove image/i }));
      expect(
        screen.queryByAltText(/question image/i),
      ).not.toBeInTheDocument();
    });

    it("rejects an oversized image without adding a preview", async () => {
      const user = userEvent.setup();
      render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
      await openCreateDialog(user);

      const oversized = new File(
        [new Uint8Array(6 * 1024 * 1024)],
        "huge.png",
        { type: "image/png" },
      );
      await user.upload(screen.getByLabelText(/add image/i), oversized);

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringMatching(/5mb or smaller/i),
      );
      expect(
        screen.queryByAltText(/question image/i),
      ).not.toBeInTheDocument();
    });

    it("uploads a picked image before creating the quiz, and sends its path with the question", async () => {
      const user = userEvent.setup();
      const createQuizAction = vi.mocked(quizActions.createQuizAction);
      createQuizAction.mockResolvedValue(baseQuiz);

      const uploadMock = vi.fn(async () => ({
        data: { path: "ignored" },
        error: null,
      }));
      vi.mocked(createBrowserClient).mockReturnValue({
        auth: {
          getUser: vi.fn(async () => ({
            data: { user: { id: "teacher-1" } },
          })),
        },
        storage: { from: vi.fn(() => ({ upload: uploadMock })) },
      } as never);

      render(<TeacherQuizBuilder classes={classes} initialQuizzes={[]} />);
      await openCreateDialog(user);

      await user.type(screen.getByLabelText(/title/i), "Chapter 3 Quiz");
      await user.type(
        screen.getByPlaceholderText(/question text/i),
        "What shape is this?",
      );
      await user.type(screen.getByPlaceholderText(/option 1/i), "Square");
      await user.type(screen.getByPlaceholderText(/option 2/i), "Circle");

      const file = new File(["fake-bytes"], "shape.png", {
        type: "image/png",
      });
      await user.upload(screen.getByLabelText(/add image/i), file);
      await screen.findByAltText(/question image/i);

      await user.click(screen.getByRole("button", { name: /create quiz/i }));

      await waitFor(() => {
        expect(uploadMock).toHaveBeenCalledWith(
          expect.stringMatching(/^teacher-1\/.+\.png$/),
          file,
          { contentType: "image/png" },
        );
        expect(createQuizAction).toHaveBeenCalledWith(
          expect.objectContaining({
            questions: [
              expect.objectContaining({
                imagePath: expect.stringMatching(/^teacher-1\/.+\.png$/),
              }),
            ],
          }),
        );
      });
    });
  });

  describe("search and filter", () => {
    const quizzes = [
      {
        ...baseQuiz,
        id: "quiz-1",
        title: "Chapter 3 Quiz",
        assignedClasses: [
          { id: "class-1", name: "Algebra II", shuffleQuestions: false },
        ],
      },
      {
        ...baseQuiz,
        id: "quiz-2",
        title: "Cell Biology Basics",
        assignedClasses: [
          { id: "class-2", name: "Biology", shuffleQuestions: false },
        ],
      },
      {
        ...baseQuiz,
        id: "quiz-3",
        title: "Pop Quiz - Draft",
        assignedClasses: [],
      },
    ];

    it("filters the list by title as the teacher types", async () => {
      const user = userEvent.setup();
      render(<TeacherQuizBuilder classes={classes} initialQuizzes={quizzes} />);

      await user.type(
        screen.getByLabelText(/search quizzes by title/i),
        "cell",
      );

      expect(screen.getByText("Cell Biology Basics")).toBeInTheDocument();
      expect(screen.queryByText("Chapter 3 Quiz")).not.toBeInTheDocument();
      expect(screen.queryByText("Pop Quiz - Draft")).not.toBeInTheDocument();
    });

    it("filters the list to quizzes assigned to a specific class", async () => {
      const user = userEvent.setup();
      render(<TeacherQuizBuilder classes={classes} initialQuizzes={quizzes} />);

      await user.selectOptions(
        screen.getByLabelText(/filter by assigned class/i),
        "class-2",
      );

      expect(screen.getByText("Cell Biology Basics")).toBeInTheDocument();
      expect(screen.queryByText("Chapter 3 Quiz")).not.toBeInTheDocument();
      expect(screen.queryByText("Pop Quiz - Draft")).not.toBeInTheDocument();
    });

    it("filters the list to quizzes with no assigned class", async () => {
      const user = userEvent.setup();
      render(<TeacherQuizBuilder classes={classes} initialQuizzes={quizzes} />);

      await user.selectOptions(
        screen.getByLabelText(/filter by assigned class/i),
        "unassigned",
      );

      expect(screen.getByText("Pop Quiz - Draft")).toBeInTheDocument();
      expect(screen.queryByText("Chapter 3 Quiz")).not.toBeInTheDocument();
      expect(screen.queryByText("Cell Biology Basics")).not.toBeInTheDocument();
    });

    it("combines the search and class filter", async () => {
      const user = userEvent.setup();
      render(<TeacherQuizBuilder classes={classes} initialQuizzes={quizzes} />);

      await user.type(
        screen.getByLabelText(/search quizzes by title/i),
        "quiz",
      );
      await user.selectOptions(
        screen.getByLabelText(/filter by assigned class/i),
        "class-1",
      );

      expect(screen.getByText("Chapter 3 Quiz")).toBeInTheDocument();
      expect(screen.queryByText("Cell Biology Basics")).not.toBeInTheDocument();
      expect(screen.queryByText("Pop Quiz - Draft")).not.toBeInTheDocument();
    });

    it("shows a no-match message instead of the empty-state message when nothing matches", async () => {
      const user = userEvent.setup();
      render(<TeacherQuizBuilder classes={classes} initialQuizzes={quizzes} />);

      await user.type(
        screen.getByLabelText(/search quizzes by title/i),
        "nonexistent quiz title",
      );

      expect(
        screen.getByText(/no quizzes match your search/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/no quizzes created yet/i),
      ).not.toBeInTheDocument();
    });
  });
});
