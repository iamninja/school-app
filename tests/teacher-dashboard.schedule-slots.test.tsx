/// <reference types="vitest/globals" />

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import { setScheduleSlotStudentsAction } from "@/app/protected/teacher/actions";

vi.mock("@/app/protected/teacher/actions", () => ({
  archiveClassAction: vi.fn(),
  createClassAction: vi.fn(),
  createStudentAction: vi.fn(),
  deleteClassAction: vi.fn(),
  enrollStudentInClassAction: vi.fn(),
  getAttendanceAction: vi.fn().mockResolvedValue([]),
  restoreClassAction: vi.fn(),
  restoreStudentAction: vi.fn(),
  setAttendanceAction: vi
    .fn()
    .mockResolvedValue({ studentId: "", status: "", chargedAmount: null }),
  setScheduleSlotAction: vi.fn(),
  setScheduleSlotStudentsAction: vi.fn(),
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

describe("TeacherDashboard schedule slots - split hours", () => {
  const student = (id: string, firstName: string) => ({
    id,
    firstName,
    lastName: "Test",
    gradeLevel: "11",
    email: `${id}@example.com`,
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    parentTwoName: "",
    parentTwoEmail: "",
    parentTwoPhone: "",
    tuitionAmount: "100",
    tuitionStatus: "current" as const,
    assignedClassIds: ["class-1"],
  });
  const baseProps = {
    initialClasses: [{ id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null }],
    // Mon 15:15-17:00 for everyone, then the third hour for Maya and Alex only.
    initialSlots: [
      { day: "Mon", time: "15:15", classId: "class-1", isTwoHour: true },
      { day: "Mon", time: "17:00", classId: "class-1", studentIds: ["s1", "s2"] },
    ],
    initialStudents: [student("s1", "Maya"), student("s2", "Alex"), student("s3", "Nikos")],
    initialAttendance: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows who a split hour is for, and the left-out student's own hour to place", () => {
    render(<TeacherDashboard {...baseProps} />);
    expect(screen.getByText("2 of 3 · Maya, Alex")).toBeInTheDocument();
    // The class chip is done; Nikos is an hour short.
    expect(screen.getByText("0 left")).toBeInTheDocument();
    expect(screen.getByText("Algebra II · Nikos")).toBeInTheDocument();
    expect(screen.getByText("1 left")).toBeInTheDocument();
  });

  it("joins a split hour back for everyone from the Who comes dialog", async () => {
    const user = userEvent.setup();
    vi.mocked(setScheduleSlotStudentsAction).mockResolvedValue([
      { day: "Mon", time: "17:00", classId: "class-1", isTwoHour: false, endTime: null, studentIds: null },
    ]);
    render(<TeacherDashboard {...baseProps} />);

    const buttons = screen.getAllByRole("button", { name: "Who comes to this hour" });
    await user.click(buttons[1]);
    await user.click(screen.getByRole("checkbox", { name: /Nikos/ }));
    await user.click(screen.getByRole("button", { name: "Join back" }));

    expect(setScheduleSlotStudentsAction).toHaveBeenCalledWith({
      day: "Mon",
      time: "17:00",
      studentIds: null,
      hour: undefined,
    });
    expect(screen.queryByText("Algebra II · Nikos")).not.toBeInTheDocument();
  });

  it("splits a two-hour lesson's second hour", async () => {
    const user = userEvent.setup();
    vi.mocked(setScheduleSlotStudentsAction).mockResolvedValue([]);
    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getAllByRole("button", { name: "Who comes to this hour" })[0]);
    await user.click(screen.getByRole("checkbox", { name: /Alex/ }));
    await user.click(screen.getByRole("button", { name: "Split this hour" }));

    expect(setScheduleSlotStudentsAction).toHaveBeenCalledWith({
      day: "Mon",
      time: "15:15",
      studentIds: ["s1", "s3"],
      hour: "second",
    });
  });
});
