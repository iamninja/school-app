/// <reference types="vitest/globals" />

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import * as actions from "@/app/protected/teacher/actions";
import * as quizActions from "@/app/protected/teacher/quiz-actions";

vi.mock("@/app/protected/teacher/actions", () => ({
  archiveClassAction: vi.fn(),
  createClassAction: vi.fn(),
  createStudentAction: vi.fn(),
  deleteClassAction: vi.fn(),
  enrollStudentInClassAction: vi.fn(),
  getAttendanceAction: vi.fn().mockResolvedValue([]),
  restoreClassAction: vi.fn(),
  restoreStudentAction: vi.fn(),
  setAttendanceAction: vi.fn(),
  setScheduleSlotAction: vi.fn(),
  unenrollStudentFromClassAction: vi.fn(),
  updateClassAction: vi.fn(),
  withdrawStudentAction: vi.fn(),
}));

vi.mock("@/app/protected/teacher/quiz-actions", () => ({
  createQuizAction: vi.fn(),
  assignQuizToClassAction: vi.fn(),
  unassignQuizFromClassAction: vi.fn(),
  setQuizAssignmentShuffleAction: vi.fn(),
  setQuizAssignmentMaxAttemptsAction: vi.fn(),
  getQuizForEditingAction: vi.fn(),
  updateQuizAction: vi.fn(),
  duplicateQuizAction: vi.fn(),
  deleteQuizAction: vi.fn(),
  getQuizResultsAction: vi.fn(),
  getStudentQuizAttemptAction: vi.fn(),
  getQuizQuestionBreakdownAction: vi.fn(),
  getClassPendingGradingAction: vi.fn().mockResolvedValue([]),
  gradeShortAnswerAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("TeacherDashboard class detail - enrollment", () => {
  const baseProps = {
    initialClasses: [
      { id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null },
      { id: "class-2", name: "Geometry", hoursPerWeek: 2, archivedAt: null },
    ],
    initialSlots: [],
    initialStudents: [
      {
        id: "student-1",
        firstName: "Maya",
        lastName: "Carter",
        gradeLevel: "10",
        email: "maya@example.com",
        parentName: "Jordan Carter",
        parentEmail: "parent@example.com",
        parentPhone: "(555) 123-4567",
        tuitionAmount: "420",
        tuitionStatus: "current" as const,
        assignedClassIds: ["class-1"],
      },
      {
        id: "student-2",
        firstName: "Alex",
        lastName: "Johnson",
        gradeLevel: "10",
        email: "alex@example.com",
        parentName: "Sam Johnson",
        parentEmail: "sam@example.com",
        parentPhone: "(555) 987-6543",
        tuitionAmount: "420",
        tuitionStatus: "current" as const,
        assignedClassIds: [],
      },
    ],
    initialAttendance: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openAlgebraDetail(user: ReturnType<typeof userEvent.setup>) {
    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByText("Algebra II"));
    expect(
      screen.getByRole("button", { name: /back to classes/i }),
    ).toBeInTheDocument();
  }

  it("shows enrolled students and lets you remove one", async () => {
    const user = userEvent.setup();
    const unenrollStudentFromClassAction = vi.mocked(
      actions.unenrollStudentFromClassAction,
    );
    unenrollStudentFromClassAction.mockResolvedValue(undefined);

    await openAlgebraDetail(user);

    expect(screen.getByText("Maya Carter")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /remove maya carter from this class/i,
      }),
    );

    await waitFor(() => {
      expect(unenrollStudentFromClassAction).toHaveBeenCalledWith(
        "student-1",
        "class-1",
      );
    });
    await waitFor(() => {
      expect(screen.queryByText("Maya Carter")).not.toBeInTheDocument();
    });
    expect(
      screen.getByText(/no students enrolled in this class/i),
    ).toBeInTheDocument();

    // Removing a student is not the same click target as viewing one - we
    // should still be looking at the class detail view, not have navigated
    // to the Students tab.
    expect(
      screen.getByRole("button", { name: /back to classes/i }),
    ).toBeInTheDocument();
  });

  it("enrolls and unenrolls students from the Enroll students dialog", async () => {
    const user = userEvent.setup();
    const enrollStudentInClassAction = vi.mocked(
      actions.enrollStudentInClassAction,
    );
    const unenrollStudentFromClassAction = vi.mocked(
      actions.unenrollStudentFromClassAction,
    );
    enrollStudentInClassAction.mockResolvedValue(undefined);
    unenrollStudentFromClassAction.mockResolvedValue(undefined);

    await openAlgebraDetail(user);

    await user.click(screen.getByRole("button", { name: /enroll students/i }));

    const dialog = screen.getByRole("dialog");

    const alexCheckbox = within(dialog).getByRole("checkbox", {
      name: "Alex Johnson",
    });
    expect(alexCheckbox).not.toBeChecked();
    await user.click(alexCheckbox);

    await waitFor(() => {
      expect(enrollStudentInClassAction).toHaveBeenCalledWith(
        "student-2",
        "class-1",
      );
    });

    const mayaCheckbox = within(dialog).getByRole("checkbox", {
      name: "Maya Carter",
    });
    expect(mayaCheckbox).toBeChecked();
    await user.click(mayaCheckbox);

    await waitFor(() => {
      expect(unenrollStudentFromClassAction).toHaveBeenCalledWith(
        "student-1",
        "class-1",
      );
    });
  });
});

describe("TeacherDashboard class detail - rendering and navigation", () => {
  const baseProps = {
    initialClasses: [
      { id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null },
    ],
    initialSlots: [{ day: "Mon", time: "15:15", classId: "class-1" }],
    initialStudents: [
      {
        id: "student-1",
        firstName: "Maya",
        lastName: "Carter",
        gradeLevel: "10",
        email: "maya@example.com",
        parentName: "Jordan Carter",
        parentEmail: "parent@example.com",
        parentPhone: "(555) 123-4567",
        tuitionAmount: "420",
        tuitionStatus: "current" as const,
        assignedClassIds: ["class-1"],
      },
      {
        id: "student-2",
        firstName: "Nina",
        lastName: "Diaz",
        gradeLevel: "10",
        email: "nina@example.com",
        withdrawnAt: "2026-01-01T00:00:00.000Z",
        parentName: "Pat Diaz",
        parentEmail: "pat@example.com",
        parentPhone: "(555) 222-3333",
        tuitionAmount: "420",
        tuitionStatus: "current" as const,
        assignedClassIds: ["class-1"],
      },
    ],
    initialAttendance: [],
    initialQuizzes: [
      {
        id: "quiz-1",
        title: "Chapter 3 Quiz",
        description: null,
        timeLimitMinutes: 20,
        assignedClasses: [
          {
            id: "class-1",
            name: "Algebra II",
            shuffleQuestions: false,
            maxAttempts: null,
          },
        ],
        questionCount: 5,
        hasAttempts: false,
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openAlgebraDetail(user: ReturnType<typeof userEvent.setup>) {
    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByText("Algebra II"));
    expect(
      screen.getByRole("button", { name: /back to classes/i }),
    ).toBeInTheDocument();
  }

  it("shows the class's schedule, assigned quizzes, and active status", async () => {
    const user = userEvent.setup();

    await openAlgebraDetail(user);

    expect(screen.getByText(/mon.*15:15/i)).toBeInTheDocument();
    expect(screen.getByText("Chapter 3 Quiz")).toBeInTheDocument();
    expect(screen.getByText(/5 questions/i)).toBeInTheDocument();
    expect(screen.getByText(/20 min/i)).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("shows 'no answers waiting for review' when there's nothing pending", async () => {
    const user = userEvent.setup();
    vi.mocked(quizActions.getClassPendingGradingAction).mockResolvedValue([]);

    await openAlgebraDetail(user);
    await user.click(screen.getByText("Chapter 3 Quiz"));

    await waitFor(() => {
      expect(
        screen.getByText(/no answers waiting for review/i),
      ).toBeInTheDocument();
    });
  });

  it("shows a pending short-answer response and grades it correct", async () => {
    const user = userEvent.setup();
    const getClassPendingGradingAction = vi.mocked(
      quizActions.getClassPendingGradingAction,
    );
    const gradeShortAnswerAction = vi.mocked(
      quizActions.gradeShortAnswerAction,
    );
    getClassPendingGradingAction.mockResolvedValue([
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
        teacherComment: null,
      },
    ]);
    gradeShortAnswerAction.mockResolvedValue(undefined);

    await openAlgebraDetail(user);

    await waitFor(() => {
      expect(getClassPendingGradingAction).toHaveBeenCalledWith("class-1");
      expect(screen.getByText(/1 pending review/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText("Chapter 3 Quiz"));

    await waitFor(() => {
      expect(screen.getByText("Explain your reasoning")).toBeInTheDocument();
      expect(
        screen.getByText(/because 2x = 4, so x = 2/i),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /mark correct/i }));

    await waitFor(() => {
      expect(gradeShortAnswerAction).toHaveBeenCalledWith(
        "answer-1",
        true,
        null,
      );
      expect(
        screen.queryByText("Explain your reasoning"),
      ).not.toBeInTheDocument();
    });
  });

  it("excludes a withdrawn student from the enrolled-students panel", async () => {
    const user = userEvent.setup();

    await openAlgebraDetail(user);

    expect(screen.getByText("Maya Carter")).toBeInTheDocument();
    expect(screen.queryByText("Nina Diaz")).not.toBeInTheDocument();
  });

  it("edits, archives, and restores the class from the detail view", async () => {
    const user = userEvent.setup();
    const updateClassAction = vi.mocked(actions.updateClassAction);
    const archiveClassAction = vi.mocked(actions.archiveClassAction);
    const restoreClassAction = vi.mocked(actions.restoreClassAction);
    updateClassAction.mockResolvedValue({
      id: "class-1",
      name: "Algebra II Honors",
      hoursPerWeek: 3,
      grade: null,
      startDate: null,
      finishDate: null,
    });
    archiveClassAction.mockResolvedValue({
      id: "class-1",
      archivedAt: "2026-08-19T00:00:00.000Z",
    });
    restoreClassAction.mockResolvedValue({ id: "class-1", archivedAt: null });

    await openAlgebraDetail(user);

    // Edit
    await user.click(screen.getByRole("button", { name: /^\s*edit\s*$/i }));
    const editDialog = screen.getByRole("dialog");
    expect(
      within(editDialog).getByDisplayValue("Algebra II"),
    ).toBeInTheDocument();
    await user.click(within(editDialog).getByRole("button", { name: /save/i }));
    await waitFor(() => {
      expect(updateClassAction).toHaveBeenCalledWith(
        expect.objectContaining({ classId: "class-1" }),
      );
    });
    expect(await screen.findByText("Algebra II Honors")).toBeInTheDocument();

    // Archive
    await user.click(screen.getByRole("button", { name: /^\s*archive\s*$/i }));
    await waitFor(() => {
      expect(archiveClassAction).toHaveBeenCalledWith("class-1");
    });
    expect(await screen.findByText("Archived")).toBeInTheDocument();

    // Restore
    await user.click(screen.getByRole("button", { name: /^\s*restore\s*$/i }));
    await waitFor(() => {
      expect(restoreClassAction).toHaveBeenCalledWith("class-1");
    });
    expect(await screen.findByText("Active")).toBeInTheDocument();
  });

  it("jumps to a student's detail and to the Quizzes tab from the class detail view", async () => {
    const user = userEvent.setup();

    await openAlgebraDetail(user);

    await user.click(screen.getByText("Maya Carter"));
    expect(
      screen.getByRole("button", { name: /back to students/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByText("Algebra II"));
    await user.click(screen.getByRole("button", { name: /go to quizzes/i }));
    expect(
      screen.getByRole("button", { name: /new quiz/i }),
    ).toBeInTheDocument();
  });

  it("deletes the class from the detail view after confirming, and does nothing if cancelled", async () => {
    const user = userEvent.setup();
    const deleteClassAction = vi.mocked(actions.deleteClassAction);
    deleteClassAction.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm");

    await openAlgebraDetail(user);

    confirmSpy.mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: /^\s*delete\s*$/i }));
    expect(deleteClassAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /back to classes/i }),
    ).toBeInTheDocument();

    confirmSpy.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: /^\s*delete\s*$/i }));
    await waitFor(() => {
      expect(deleteClassAction).toHaveBeenCalledWith("class-1");
    });

    // The class is gone - the detail view can't show it anymore, so we
    // should be back on the (now empty) class list.
    expect(screen.queryByText("Algebra II")).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("deletes the class from the flat list row after confirming, without opening the detail view", async () => {
    const user = userEvent.setup();
    const deleteClassAction = vi.mocked(actions.deleteClassAction);
    deleteClassAction.mockResolvedValue(undefined);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));

    await user.click(screen.getByRole("button", { name: /^\s*delete\s*$/i }));

    await waitFor(() => {
      expect(deleteClassAction).toHaveBeenCalledWith("class-1");
    });
    expect(screen.queryByText("Algebra II")).not.toBeInTheDocument();
    // Deleting from the row is not the same click target as viewing the
    // class - the stopPropagation on the button must hold, or this would
    // also navigate into the (now-deleted) class's detail view.
    expect(
      screen.queryByRole("button", { name: /back to classes/i }),
    ).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("does not delete the class from the list row if the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const deleteClassAction = vi.mocked(actions.deleteClassAction);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));

    await user.click(screen.getByRole("button", { name: /^\s*delete\s*$/i }));

    expect(deleteClassAction).not.toHaveBeenCalled();
    expect(screen.getByText("Algebra II")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
