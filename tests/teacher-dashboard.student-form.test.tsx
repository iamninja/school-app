/// <reference types="vitest/globals" />

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { toast } from "sonner";

import { TeacherDashboard } from "@/components/teacher-dashboard";
import * as actions from "@/app/protected/teacher/actions";

vi.mock("@/app/protected/teacher/actions", () => ({
  createClassAction: vi.fn(),
  createStudentAction: vi.fn(),
  getAttendanceAction: vi.fn().mockResolvedValue([]),
  setAttendanceAction: vi.fn(),
  setScheduleSlotAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe("TeacherDashboard student form", () => {
  const baseProps = {
    initialClasses: [],
    initialSlots: [],
    initialStudents: [],
    initialAttendance: [],
  };

  it("does not submit without first name", async () => {
    const user = userEvent.setup();
    const createStudentAction = vi.mocked(actions.createStudentAction);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "10");
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    await user.type(screen.getByLabelText(/parent name/i), "Jordan Carter");
    await user.type(
      screen.getByLabelText(/parent email/i),
      "parent@example.com",
    );
    await user.type(screen.getByLabelText(/parent phone/i), "(555) 123-4567");

    await user.click(screen.getByRole("button", { name: /create student/i }));
    expect(createStudentAction).not.toHaveBeenCalled();
  });

  it("does not submit without last name", async () => {
    const user = userEvent.setup();
    const createStudentAction = vi.mocked(actions.createStudentAction);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "10");
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    await user.type(screen.getByLabelText(/parent name/i), "Jordan Carter");
    await user.type(
      screen.getByLabelText(/parent email/i),
      "parent@example.com",
    );
    await user.type(screen.getByLabelText(/parent phone/i), "(555) 123-4567");

    await user.click(screen.getByRole("button", { name: /create student/i }));
    expect(createStudentAction).not.toHaveBeenCalled();
  });

  it("does not submit without grade", async () => {
    const user = userEvent.setup();
    const createStudentAction = vi.mocked(actions.createStudentAction);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    await user.type(screen.getByLabelText(/parent name/i), "Jordan Carter");
    await user.type(
      screen.getByLabelText(/parent email/i),
      "parent@example.com",
    );
    await user.type(screen.getByLabelText(/parent phone/i), "(555) 123-4567");

    await user.click(screen.getByRole("button", { name: /create student/i }));
    expect(createStudentAction).not.toHaveBeenCalled();
  });

  it("does not submit without student email", async () => {
    const user = userEvent.setup();
    const createStudentAction = vi.mocked(actions.createStudentAction);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.type(screen.getByLabelText(/^grade$/i), "10");
    await user.type(screen.getByLabelText(/parent name/i), "Jordan Carter");
    await user.type(
      screen.getByLabelText(/parent email/i),
      "parent@example.com",
    );
    await user.type(screen.getByLabelText(/parent phone/i), "(555) 123-4567");

    await user.click(screen.getByRole("button", { name: /create student/i }));
    expect(createStudentAction).not.toHaveBeenCalled();
  });

  it("does not submit without parent name", async () => {
    const user = userEvent.setup();
    const createStudentAction = vi.mocked(actions.createStudentAction);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "10");
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    await user.type(
      screen.getByLabelText(/parent email/i),
      "parent@example.com",
    );
    await user.type(screen.getByLabelText(/parent phone/i), "(555) 123-4567");

    await user.click(screen.getByRole("button", { name: /create student/i }));
    expect(createStudentAction).not.toHaveBeenCalled();
  });

  it("does not submit without parent email", async () => {
    const user = userEvent.setup();
    const createStudentAction = vi.mocked(actions.createStudentAction);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "10");
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    await user.type(screen.getByLabelText(/parent name/i), "Jordan Carter");
    await user.type(screen.getByLabelText(/parent phone/i), "(555) 123-4567");

    await user.click(screen.getByRole("button", { name: /create student/i }));
    expect(createStudentAction).not.toHaveBeenCalled();
  });

  it("does not submit without parent phone", async () => {
    const user = userEvent.setup();
    const createStudentAction = vi.mocked(actions.createStudentAction);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "10");
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    await user.type(screen.getByLabelText(/parent name/i), "Jordan Carter");
    await user.type(
      screen.getByLabelText(/parent email/i),
      "parent@example.com",
    );

    await user.click(screen.getByRole("button", { name: /create student/i }));
    expect(createStudentAction).not.toHaveBeenCalled();
  });

  it("submits when all required fields are provided", async () => {
    const user = userEvent.setup();
    const createStudentAction = vi.mocked(actions.createStudentAction);

    createStudentAction.mockResolvedValue({
      id: "student-1",
      firstName: "Maya",
      lastName: "Carter",
      gradeLevel: "10",
      email: "maya@example.com",
      parentName: "Jordan Carter",
      parentEmail: "parent@example.com",
      parentPhone: "(555) 123-4567",
      parentTwoName: "",
      parentTwoEmail: "",
      parentTwoPhone: "",
      tuitionAmount: "420",
      tuitionStatus: "current",
      assignedClassIds: [],
    });

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "10");
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    await user.type(screen.getByLabelText(/parent name/i), "Jordan Carter");
    await user.type(
      screen.getByLabelText(/parent email/i),
      "parent@example.com",
    );
    await user.type(screen.getByLabelText(/parent phone/i), "(555) 123-4567");

    await user.click(screen.getByRole("button", { name: /create student/i }));

    expect(createStudentAction).toHaveBeenCalled();
    expect(await screen.findByText(/maya carter/i)).toBeInTheDocument();
  });

  it("shows toast notification when submitting without required fields", async () => {
    const user = userEvent.setup();
    const toastError = vi.mocked(toast.error);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    // Try to submit empty form
    await user.click(screen.getByRole("button", { name: /create student/i }));

    expect(toastError).toHaveBeenCalledWith(
      "Please fill in all required fields",
      {
        description:
          "Missing: First name, Last name, Grade, Email, Parent name, Parent email, Parent phone",
      },
    );
  });

  it("shows toast notification when submitting with only first name", async () => {
    const user = userEvent.setup();
    const toastError = vi.mocked(toast.error);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.click(screen.getByRole("button", { name: /create student/i }));

    expect(toastError).toHaveBeenCalledWith(
      "Please fill in all required fields",
      {
        description:
          "Missing: Last name, Grade, Email, Parent name, Parent email, Parent phone",
      },
    );
  });

  it("shows toast notification when missing parent information", async () => {
    const user = userEvent.setup();
    const toastError = vi.mocked(toast.error);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "10");
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    // Missing all parent info

    await user.click(screen.getByRole("button", { name: /create student/i }));

    expect(toastError).toHaveBeenCalledWith(
      "Please fill in all required fields",
      {
        description: "Missing: Parent name, Parent email, Parent phone",
      },
    );
  });

  it("shows toast notification when missing student grade", async () => {
    const user = userEvent.setup();
    const toastError = vi.mocked(toast.error);

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    // Grade not selected
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    await user.type(screen.getByLabelText(/parent name/i), "Jordan Carter");
    await user.type(
      screen.getByLabelText(/parent email/i),
      "parent@example.com",
    );
    await user.type(screen.getByLabelText(/parent phone/i), "(555) 123-4567");

    await user.click(screen.getByRole("button", { name: /create student/i }));

    expect(toastError).toHaveBeenCalledWith(
      "Please fill in all required fields",
      {
        description: "Missing: Grade",
      },
    );
  });

  it("highlights missing fields with red border when validation fails", async () => {
    const user = userEvent.setup();

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    // Try to submit empty form
    await user.click(screen.getByRole("button", { name: /create student/i }));

    // Check that required fields have error styling (red border)
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const gradeSelect = screen.getByLabelText(/^grade$/i);
    const emailInput = screen.getByLabelText(/^email$/i);
    const parentNameInput = screen.getByLabelText(/parent name/i);
    const parentEmailInput = screen.getByLabelText(/parent email/i);
    const parentPhoneInput = screen.getByLabelText(/parent phone/i);

    expect(firstNameInput).toHaveClass("border-red-500");
    expect(lastNameInput).toHaveClass("border-red-500");
    expect(gradeSelect).toHaveClass("border-red-500");
    expect(emailInput).toHaveClass("border-red-500");
    expect(parentNameInput).toHaveClass("border-red-500");
    expect(parentEmailInput).toHaveClass("border-red-500");
    expect(parentPhoneInput).toHaveClass("border-red-500");
  });

  it("clears field highlight when user starts typing in errored field", async () => {
    const user = userEvent.setup();

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    // Submit empty form to trigger errors
    await user.click(screen.getByRole("button", { name: /create student/i }));

    const firstNameInput = screen.getByLabelText(/first name/i);
    expect(firstNameInput).toHaveClass("border-red-500");

    // Start typing in the field
    await user.type(firstNameInput, "M");

    // Error highlight should be cleared after state updates
    await waitFor(() => {
      expect(firstNameInput).not.toHaveClass("border-red-500");
    });
  });

  it("highlights only the specific missing fields", async () => {
    const user = userEvent.setup();

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    // Fill in some fields but not all
    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "10");

    // Try to submit
    await user.click(screen.getByRole("button", { name: /create student/i }));

    // Filled fields should NOT have error styling
    const firstNameInput = screen.getByLabelText(/first name/i);
    const lastNameInput = screen.getByLabelText(/last name/i);
    const gradeSelect = screen.getByLabelText(/^grade$/i);

    expect(firstNameInput).not.toHaveClass("border-red-500");
    expect(lastNameInput).not.toHaveClass("border-red-500");
    expect(gradeSelect).not.toHaveClass("border-red-500");

    // Empty fields should have error styling
    const emailInput = screen.getByLabelText(/^email$/i);
    const parentNameInput = screen.getByLabelText(/parent name/i);
    const parentEmailInput = screen.getByLabelText(/parent email/i);
    const parentPhoneInput = screen.getByLabelText(/parent phone/i);

    expect(emailInput).toHaveClass("border-red-500");
    expect(parentNameInput).toHaveClass("border-red-500");
    expect(parentEmailInput).toHaveClass("border-red-500");
    expect(parentPhoneInput).toHaveClass("border-red-500");
  });

  it("clears all highlights after successful form submission", async () => {
    const user = userEvent.setup();
    const createStudentAction = vi.mocked(actions.createStudentAction);

    createStudentAction.mockResolvedValue({
      id: "student-1",
      firstName: "Maya",
      lastName: "Carter",
      gradeLevel: "10",
      email: "maya@example.com",
      parentName: "Jordan Carter",
      parentEmail: "parent@example.com",
      parentPhone: "(555) 123-4567",
      parentTwoName: "",
      parentTwoEmail: "",
      parentTwoPhone: "",
      tuitionAmount: "420",
      tuitionStatus: "current",
      assignedClassIds: [],
    });

    render(<TeacherDashboard {...baseProps} />);

    await user.click(screen.getByRole("tab", { name: /students/i }));

    // Trigger validation errors first
    await user.click(screen.getByRole("button", { name: /create student/i }));

    // Verify fields are highlighted
    expect(screen.getByLabelText(/first name/i)).toHaveClass("border-red-500");

    // Now fill all required fields
    await user.type(screen.getByLabelText(/first name/i), "Maya");
    await user.type(screen.getByLabelText(/last name/i), "Carter");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "10");
    await user.type(screen.getByLabelText(/^email$/i), "maya@example.com");
    await user.type(screen.getByLabelText(/parent name/i), "Jordan Carter");
    await user.type(
      screen.getByLabelText(/parent email/i),
      "parent@example.com",
    );
    await user.type(screen.getByLabelText(/parent phone/i), "(555) 123-4567");

    // Submit successfully
    await user.click(screen.getByRole("button", { name: /create student/i }));

    // Wait for student to appear
    await screen.findByText(/maya carter/i);

    // After successful submission, form should be cleared and no errors
    // Note: Form is cleared, so we need to check the empty fields don't have errors
    const firstNameInput = screen.getByLabelText(/first name/i);
    expect(firstNameInput).toHaveValue("");
    expect(firstNameInput).not.toHaveClass("border-red-500");
  });
});
