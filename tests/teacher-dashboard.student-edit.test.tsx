/// <reference types="vitest/globals" />

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { toast } from "sonner";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import * as actions from "@/app/protected/teacher/actions";
import { ExpectedError } from "@/lib/expected-error";

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
  updateStudentAction: vi.fn(),
  withdrawStudentAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("TeacherDashboard student detail - edit", () => {
  const baseProps = {
    initialClasses: [
      { id: "class-1", name: "Algebra II", hoursPerWeek: 3, archivedAt: null },
      { id: "class-2", name: "Geometry", hoursPerWeek: 2, archivedAt: null },
      {
        id: "class-3",
        name: "Old Trigonometry",
        hoursPerWeek: 2,
        archivedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    initialSlots: [],
    initialStudents: [
      {
        id: "student-1",
        firstName: "Maya",
        lastName: "Carter",
        gradeLevel: "10",
        email: "maya@example.com",
        familyId: "family-1",
        parentName: "Jordan Carter",
        parentEmail: "parent@example.com",
        parentPhone: "(555) 123-4567",
        tuitionAmount: "420",
        tuitionStatus: "current" as const,
        assignedClassIds: ["class-1", "class-3"],
      },
      {
        id: "student-2",
        firstName: "Emma",
        lastName: "Carter",
        gradeLevel: "7",
        email: "emma@example.com",
        familyId: "family-1",
        parentName: "Jordan Carter",
        parentEmail: "parent@example.com",
        parentPhone: "(555) 123-4567",
        tuitionAmount: "400",
        tuitionStatus: "current" as const,
        assignedClassIds: [],
      },
    ],
    initialFamilies: [
      {
        id: "family-1",
        parentNames: ["Jordan Carter"],
        parentEmails: ["parent@example.com"],
        studentNames: ["Maya Carter", "Emma Carter"],
      },
    ],
    initialAttendance: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function openMayaDetail(user: ReturnType<typeof userEvent.setup>) {
    render(<TeacherDashboard {...baseProps} />);
    await user.click(screen.getByRole("tab", { name: /students/i }));
    await user.click(screen.getByText(/maya carter/i));
    expect(
      screen.getByRole("button", { name: /back to students/i }),
    ).toBeInTheDocument();
  }

  it("hides archived assigned classes behind a toggle, showing only active ones by default", async () => {
    const user = userEvent.setup();

    await openMayaDetail(user);

    expect(screen.getByText("Algebra II")).toBeInTheDocument();
    expect(screen.queryByText("Old Trigonometry")).not.toBeInTheDocument();

    const archivedToggle = screen.getByRole("button", {
      name: /\+1 archived/i,
    });
    await user.click(archivedToggle);

    expect(screen.getByText("Old Trigonometry")).toBeInTheDocument();
  });

  it("does not save when a required field is cleared", async () => {
    const user = userEvent.setup();
    const updateStudentAction = vi.mocked(actions.updateStudentAction);
    const toastError = vi.mocked(toast.error);

    await openMayaDetail(user);
    await user.click(screen.getByRole("button", { name: /^\s*edit\s*$/i }));

    const dialog = screen.getByRole("dialog");
    const firstNameInput = within(dialog).getByLabelText(/first name/i);
    await user.clear(firstNameInput);

    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    expect(toastError).toHaveBeenCalledWith(
      "Please fill in all required fields",
      expect.objectContaining({
        description: expect.stringContaining("First name"),
      }),
    );
    expect(updateStudentAction).not.toHaveBeenCalled();
    // The dialog should still be open with the invalid state, not silently
    // closed.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("surfaces a failed update as a toast error and keeps the dialog open", async () => {
    const user = userEvent.setup();
    const updateStudentAction = vi.mocked(actions.updateStudentAction);
    const toastError = vi.mocked(toast.error);
    updateStudentAction.mockRejectedValue(
      new ExpectedError(
        "This parent email is already registered to another family.",
      ),
    );

    await openMayaDetail(user);
    await user.click(screen.getByRole("button", { name: /^\s*edit\s*$/i }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith(
        "This parent email is already registered to another family.",
      );
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("edits a student's own details and updates the detail view", async () => {
    const user = userEvent.setup();
    const updateStudentAction = vi.mocked(actions.updateStudentAction);
    updateStudentAction.mockResolvedValue({
      id: "student-1",
      familyId: "family-1",
      firstName: "Maya",
      lastName: "Carterson",
      gradeLevel: "10",
      email: "maya@example.com",
      parentName: "Jordan Carter",
      parentEmail: "parent@example.com",
      parentPhone: "(555) 123-4567",
      parentTwoName: "",
      parentTwoEmail: "",
      parentTwoPhone: "",
      tuitionAmount: "500",
      tuitionStatus: "current",
    });

    await openMayaDetail(user);
    await user.click(screen.getByRole("button", { name: /^\s*edit\s*$/i }));

    const dialog = screen.getByRole("dialog");
    const lastNameInput = within(dialog).getByLabelText(/last name/i);
    await user.clear(lastNameInput);
    await user.type(lastNameInput, "Carterson");

    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(updateStudentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: "student-1",
          lastName: "Carterson",
        }),
      );
    });

    expect(await screen.findByText(/maya carterson/i)).toBeInTheDocument();
  });

  it("adds a second parent and tuition details via the edit dialog", async () => {
    const user = userEvent.setup();
    const updateStudentAction = vi.mocked(actions.updateStudentAction);
    updateStudentAction.mockResolvedValue({
      id: "student-1",
      familyId: "family-1",
      firstName: "Maya",
      lastName: "Carter",
      gradeLevel: "10",
      email: "maya@example.com",
      parentName: "Jordan Carter",
      parentEmail: "parent@example.com",
      parentPhone: "(555) 123-4567",
      parentTwoName: "Jamie Carter",
      parentTwoEmail: "jamie@example.com",
      parentTwoPhone: "(555) 999-1111",
      tuitionAmount: "450",
      tuitionStatus: "past-due",
    });

    await openMayaDetail(user);
    await user.click(screen.getByRole("button", { name: /^\s*edit\s*$/i }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).queryByLabelText(/^name$/i),
    ).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: /add second parent/i }),
    );
    await user.type(within(dialog).getByLabelText(/^name$/i), "Jamie Carter");
    // "Email" is ambiguous - the student's own email field uses the same
    // bare label as the second parent's. The second parent's fields render
    // after it in the form, so it's the second match.
    const emailInputs = within(dialog).getAllByLabelText(/^email$/i);
    await user.type(emailInputs[emailInputs.length - 1], "jamie@example.com");
    await user.type(
      within(dialog).getByLabelText(/^phone$/i),
      "(555) 999-1111",
    );

    const tuitionAmountInput = within(dialog).getByLabelText(/amount/i);
    await user.clear(tuitionAmountInput);
    await user.type(tuitionAmountInput, "450");
    await user.selectOptions(
      within(dialog).getByLabelText(/status/i),
      "past-due",
    );

    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(updateStudentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: "student-1",
          parentTwoName: "Jamie Carter",
          parentTwoEmail: "jamie@example.com",
          parentTwoPhone: "(555) 999-1111",
          tuitionAmount: "450",
          tuitionStatus: "past-due",
        }),
      );
    });
  });

  it("shows a shared-parent note for a sibling family and syncs the sibling's cached info", async () => {
    const user = userEvent.setup();
    const updateStudentAction = vi.mocked(actions.updateStudentAction);
    updateStudentAction.mockResolvedValue({
      id: "student-1",
      familyId: "family-1",
      firstName: "Maya",
      lastName: "Carter",
      gradeLevel: "10",
      email: "maya@example.com",
      parentName: "Jordan Carter-Smith",
      parentEmail: "parent@example.com",
      parentPhone: "(555) 123-4567",
      parentTwoName: "",
      parentTwoEmail: "",
      parentTwoPhone: "",
      tuitionAmount: "420",
      tuitionStatus: "current",
    });

    await openMayaDetail(user);
    await user.click(screen.getByRole("button", { name: /^\s*edit\s*$/i }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText(/shared with 1 other sibling/i),
    ).toBeInTheDocument();

    const parentNameInput = within(dialog).getByLabelText(/parent name/i);
    await user.clear(parentNameInput);
    await user.type(parentNameInput, "Jordan Carter-Smith");
    await user.click(within(dialog).getByRole("button", { name: /save/i }));

    await waitFor(() => {
      expect(updateStudentAction).toHaveBeenCalled();
    });

    // Back to the list, then into Emma's detail - her cached parent info
    // should already reflect the edit made from Maya's view, with no reload.
    await user.click(screen.getByRole("button", { name: /back to students/i }));
    await user.click(screen.getByText(/emma carter/i));

    expect(await screen.findByText(/jordan carter-smith/i)).toBeInTheDocument();
  });

  it("manages class enrollment from the student detail view", async () => {
    const user = userEvent.setup();
    const enrollStudentInClassAction = vi.mocked(
      actions.enrollStudentInClassAction,
    );
    const unenrollStudentFromClassAction = vi.mocked(
      actions.unenrollStudentFromClassAction,
    );
    enrollStudentInClassAction.mockResolvedValue(undefined);
    unenrollStudentFromClassAction.mockResolvedValue(undefined);

    await openMayaDetail(user);
    await user.click(screen.getByRole("button", { name: /manage classes/i }));

    const dialog = screen.getByRole("dialog");
    const algebraCheckbox = within(dialog).getByRole("checkbox", {
      name: "Algebra II",
    });
    const geometryCheckbox = within(dialog).getByRole("checkbox", {
      name: "Geometry",
    });
    expect(algebraCheckbox).toBeChecked();
    expect(geometryCheckbox).not.toBeChecked();

    await user.click(geometryCheckbox);
    await waitFor(() => {
      expect(enrollStudentInClassAction).toHaveBeenCalledWith(
        "student-1",
        "class-2",
      );
    });

    await user.click(algebraCheckbox);
    await waitFor(() => {
      expect(unenrollStudentFromClassAction).toHaveBeenCalledWith(
        "student-1",
        "class-1",
      );
    });
  });

  it("falls back to the snapshotted class name for a deleted class's attendance record", async () => {
    const user = userEvent.setup();

    render(
      <TeacherDashboard
        {...baseProps}
        initialAttendance={[
          {
            studentId: "student-1",
            classId: null,
            className: "Old Chemistry",
            attendanceDate: "2026-01-05",
            status: "present",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /students/i }));
    await user.click(screen.getByText(/maya carter/i));

    expect(screen.getByText("Old Chemistry")).toBeInTheDocument();
  });

  it("prefers the live class name over the snapshot when the class still exists", async () => {
    const user = userEvent.setup();

    render(
      <TeacherDashboard
        {...baseProps}
        initialAttendance={[
          {
            studentId: "student-1",
            classId: "class-1",
            className: "stale snapshot, should be ignored",
            attendanceDate: "2026-01-05",
            status: "present",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("tab", { name: /students/i }));
    await user.click(screen.getByText(/maya carter/i));

    // "Attendance" also matches the sidebar tab label - find the panel
    // heading specifically (the one with a .rounded-lg card ancestor).
    const attendancePanel = screen
      .getAllByText("Attendance")
      .map((el) => el.closest(".rounded-lg"))
      .find((el): el is HTMLElement => el !== null) as HTMLElement;
    expect(within(attendancePanel).getByText("Algebra II")).toBeInTheDocument();
    expect(
      screen.queryByText("stale snapshot, should be ignored"),
    ).not.toBeInTheDocument();
  });
});
