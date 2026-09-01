/// <reference types="vitest/globals" />

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { TeacherDashboard } from "@/components/teacher-dashboard";

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
  regradeShortAnswerWithAiAction: vi.fn(),
  setAnswerCommentAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Regression coverage for a real bug found via a hosted account: a stray
// class_schedule_slots row with a malformed day ("Monday" instead of "Mon")
// or an off-grid time renders nowhere in the Schedule tab, but was still
// being counted toward that class's hoursPerWeek quota - silently deflating
// the Class dock's "remaining" count with no visible slot to explain why.
describe("TeacherDashboard schedule slots - ghost/malformed rows", () => {
  const baseProps = {
    initialClasses: [
      { id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null },
    ],
    initialSlots: [
      { day: "Mon", time: "15:15", classId: "class-1" },
      // Malformed - full day name, never producible by the current UI.
      { day: "Monday", time: "17:00", classId: "class-1" },
      // Malformed - a time that isn't one of SCHEDULE_ROWS's slots.
      { day: "Tue", time: "18:30", classId: "class-1" },
    ],
    initialStudents: [],
    initialAttendance: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not count a malformed/off-grid slot toward the class dock's remaining hours", () => {
    render(<TeacherDashboard {...baseProps} />);

    // hoursPerWeek 3 minus exactly one real, rendered slot (Mon 15:15) - the
    // two ghost rows must not be counted, so remaining is 2, not 0.
    expect(screen.getByText("2 left")).toBeInTheDocument();
  });

  it("does not show a ghost slot in the class detail's Schedule badges", async () => {
    const user = userEvent.setup();
    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByText("Algebra II"));

    expect(screen.getByText(/Mon.*15:15/)).toBeInTheDocument();
    expect(screen.queryByText(/Monday/)).not.toBeInTheDocument();
  });
});
