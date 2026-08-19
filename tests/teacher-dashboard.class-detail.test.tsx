/// <reference types="vitest/globals" />

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import * as actions from "@/app/protected/teacher/actions";

vi.mock("@/app/protected/teacher/actions", () => ({
  archiveClassAction: vi.fn(),
  createClassAction: vi.fn(),
  createStudentAction: vi.fn(),
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
