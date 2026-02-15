import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentSignUpForm } from "@/components/student-signup-form";
import * as actions from "@/app/auth/student/actions";

vi.mock("@/app/auth/student/actions", () => ({
  checkStudentEmailAction: vi.fn(),
  signUpStudentAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("StudentSignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires email verification before showing password fields", async () => {
    const user = userEvent.setup();

    render(<StudentSignUpForm />);

    // Password fields should not be visible initially
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/confirm password/i),
    ).not.toBeInTheDocument();

    // Only email field and verify button should be visible
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /verify/i })).toBeInTheDocument();
  });

  it("shows error when email is not found in students table", async () => {
    const user = userEvent.setup();
    const checkStudentEmailAction = vi.mocked(actions.checkStudentEmailAction);
    checkStudentEmailAction.mockResolvedValue({
      exists: false,
      error: "No student found with this email. Please contact your teacher.",
    });

    render(<StudentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "unknown@example.com");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/no student found with this email/i),
      ).toBeInTheDocument();
    });

    // Password fields should not appear
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
  });

  it("shows error when email is already registered", async () => {
    const user = userEvent.setup();
    const checkStudentEmailAction = vi.mocked(actions.checkStudentEmailAction);
    checkStudentEmailAction.mockResolvedValue({
      exists: false,
      error: "This email is already registered. Please login instead.",
    });

    render(<StudentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "registered@example.com");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/already registered.*login instead/i),
      ).toBeInTheDocument();
    });
  });

  it("shows password fields after successful email verification", async () => {
    const user = userEvent.setup();
    const checkStudentEmailAction = vi.mocked(actions.checkStudentEmailAction);
    checkStudentEmailAction.mockResolvedValue({
      exists: true,
      studentId: "student-123",
      firstName: "John",
      lastName: "Doe",
    });

    render(<StudentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "john@example.com");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(screen.getByText(/verified as john doe/i)).toBeInTheDocument();
    });

    // Password fields should now be visible
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account/i }),
    ).toBeInTheDocument();
  });

  it("validates that passwords match", async () => {
    const user = userEvent.setup();
    const checkStudentEmailAction = vi.mocked(actions.checkStudentEmailAction);
    checkStudentEmailAction.mockResolvedValue({
      exists: true,
      studentId: "student-123",
      firstName: "John",
      lastName: "Doe",
    });

    render(<StudentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "john@example.com");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^password$/i), "password123");
    await user.type(screen.getByLabelText(/confirm password/i), "different123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument();
    });
  });

  it("validates minimum password length", async () => {
    const user = userEvent.setup();
    const checkStudentEmailAction = vi.mocked(actions.checkStudentEmailAction);
    checkStudentEmailAction.mockResolvedValue({
      exists: true,
      studentId: "student-123",
      firstName: "John",
      lastName: "Doe",
    });

    render(<StudentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "john@example.com");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^password$/i), "short");
    await user.type(screen.getByLabelText(/confirm password/i), "short");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/password must be at least 6 characters/i),
      ).toBeInTheDocument();
    });
  });

  it("successfully creates account with valid data", async () => {
    const user = userEvent.setup();
    const checkStudentEmailAction = vi.mocked(actions.checkStudentEmailAction);
    const signUpStudentAction = vi.mocked(actions.signUpStudentAction);

    checkStudentEmailAction.mockResolvedValue({
      exists: true,
      studentId: "student-123",
      firstName: "John",
      lastName: "Doe",
    });

    signUpStudentAction.mockResolvedValue({ success: true });

    render(<StudentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "john@example.com");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^password$/i), "password123");
    await user.type(screen.getByLabelText(/confirm password/i), "password123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(signUpStudentAction).toHaveBeenCalledWith({
        email: "john@example.com",
        password: "password123",
      });
    });
  });

  it("disables email field after verification", async () => {
    const user = userEvent.setup();
    const checkStudentEmailAction = vi.mocked(actions.checkStudentEmailAction);
    checkStudentEmailAction.mockResolvedValue({
      exists: true,
      studentId: "student-123",
      firstName: "John",
      lastName: "Doe",
    });

    render(<StudentSignUpForm />);

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;

    await user.type(emailInput, "john@example.com");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(emailInput).toBeDisabled();
    });

    // Verify button should not be visible anymore
    expect(
      screen.queryByRole("button", { name: /verify/i }),
    ).not.toBeInTheDocument();
  });

  it("shows verification message with student name", async () => {
    const user = userEvent.setup();
    const checkStudentEmailAction = vi.mocked(actions.checkStudentEmailAction);
    checkStudentEmailAction.mockResolvedValue({
      exists: true,
      studentId: "student-123",
      firstName: "John",
      lastName: "Doe",
    });

    render(<StudentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "john@example.com");
    await user.click(screen.getByRole("button", { name: /verify/i }));

    await waitFor(() => {
      expect(screen.getByText(/verified as john doe/i)).toBeInTheDocument();
    });

    // Email input should be disabled and verify button should be hidden
    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(emailInput).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /verify/i }),
    ).not.toBeInTheDocument();
  });
});
