/// <reference types="vitest/globals" />

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import * as actions from "@/app/protected/teacher/actions";

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const baseProps = {
  initialClasses: [
    {
      id: "class-1",
      name: "Algebra II",
      hoursPerWeek: 3,
      grade: "lyk_a",
      archivedAt: null,
    },
  ],
  initialSlots: [],
  initialStudents: [],
  initialAttendance: [],
};

describe("TeacherDashboard class grade", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the grade label under a class with a grade set in the list", async () => {
    const user = userEvent.setup();
    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));

    expect(screen.getByText("Algebra II")).toBeInTheDocument();
    expect(screen.getByText("Α Λυκείου")).toBeInTheDocument();
  });

  it("does not show a grade line for a class with no grade set", async () => {
    const user = userEvent.setup();
    render(
      <TeacherDashboard
        {...baseProps}
        initialClasses={[
          { id: "class-2", name: "Geometry", hoursPerWeek: 2, archivedAt: null },
        ]}
      />,
    );
    await user.click(screen.getByRole("tab", { name: /classes/i }));

    expect(screen.getByText("Geometry")).toBeInTheDocument();
    expect(screen.queryByText(/Λυκείου|Γυμνασίου|ΕΠΑ\.Λ\./)).not.toBeInTheDocument();
  });

  it("creates a class with a selected grade", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.createClassAction).mockResolvedValue({
      id: "class-new",
      name: "Physics",
      hoursPerWeek: 2,
      grade: "gym_c",
      startDate: null,
      finishDate: null,
    });

    render(<TeacherDashboard {...baseProps} initialClasses={[]} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: /add class/i }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/class name/i), "Physics");
    await user.selectOptions(screen.getByLabelText(/grade/i), "gym_c");
    await user.click(screen.getByRole("button", { name: /create class/i }));

    await waitFor(() => {
      expect(actions.createClassAction).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Physics", grade: "gym_c" }),
      );
    });
    expect(screen.getByText("Γ Γυμνασίου")).toBeInTheDocument();
  });

  it("pre-fills the grade when editing a class, and updates it", async () => {
    const user = userEvent.setup();
    vi.mocked(actions.updateClassAction).mockResolvedValue({
      id: "class-1",
      name: "Algebra II",
      hoursPerWeek: 3,
      grade: "lyk_b",
      startDate: null,
      finishDate: null,
    });

    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /classes/i }));
    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await screen.findByRole("dialog");

    expect(screen.getByLabelText(/grade/i)).toHaveValue("lyk_a");

    await user.selectOptions(screen.getByLabelText(/grade/i), "lyk_b");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(actions.updateClassAction).toHaveBeenCalledWith(
        expect.objectContaining({ classId: "class-1", grade: "lyk_b" }),
      );
    });
    expect(screen.getByText("Β Λυκείου")).toBeInTheDocument();
  });
});
