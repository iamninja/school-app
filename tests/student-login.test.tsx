import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StudentLoginForm } from "@/components/student-login-form";
import * as actions from "@/app/auth/student/actions";

vi.mock("@/app/auth/student/actions", () => ({
  signInStudentAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: vi.fn(),
  }),
}));

describe("StudentLoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with email and password fields", () => {
    render(<StudentLoginForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/κωδικός/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /σύνδεση/i })).toBeInTheDocument();
  });

  it("shows link to sign up page", () => {
    render(<StudentLoginForm />);

    const signUpLink = screen.getByRole("link", { name: /εγγραφή/i });
    expect(signUpLink).toBeInTheDocument();
    expect(signUpLink).toHaveAttribute("href", "/auth/student-signup");
  });

  it("shows link to forgot password page", () => {
    render(<StudentLoginForm />);

    const forgotPasswordLink = screen.getByRole("link", {
      name: /ξεχάσατε τον κωδικό/i,
    });
    expect(forgotPasswordLink).toBeInTheDocument();
    expect(forgotPasswordLink).toHaveAttribute(
      "href",
      "/auth/forgot-password",
    );
  });

  it("does not submit without email", async () => {
    const user = userEvent.setup();
    const signInStudentAction = vi.mocked(actions.signInStudentAction);

    render(<StudentLoginForm />);

    await user.type(screen.getByLabelText(/κωδικός/i), "password123");
    await user.click(screen.getByRole("button", { name: /σύνδεση/i }));

    expect(signInStudentAction).not.toHaveBeenCalled();
  });

  it("does not submit without password", async () => {
    const user = userEvent.setup();
    const signInStudentAction = vi.mocked(actions.signInStudentAction);

    render(<StudentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "student@example.com");
    await user.click(screen.getByRole("button", { name: /σύνδεση/i }));

    expect(signInStudentAction).not.toHaveBeenCalled();
  });

  it("submits form with valid credentials", async () => {
    const user = userEvent.setup();
    const signInStudentAction = vi.mocked(actions.signInStudentAction);
    signInStudentAction.mockResolvedValue({ success: true });

    render(<StudentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "student@example.com");
    await user.type(screen.getByLabelText(/κωδικός/i), "password123");
    await user.click(screen.getByRole("button", { name: /σύνδεση/i }));

    await waitFor(() => {
      expect(signInStudentAction).toHaveBeenCalledWith({
        email: "student@example.com",
        password: "password123",
      });
    });
  });

  it("shows error message on failed login", async () => {
    const user = userEvent.setup();
    const signInStudentAction = vi.mocked(actions.signInStudentAction);
    signInStudentAction.mockResolvedValue({
      error: "Invalid login credentials",
    });

    render(<StudentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "student@example.com");
    await user.type(screen.getByLabelText(/κωδικός/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /σύνδεση/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/invalid login credentials/i),
      ).toBeInTheDocument();
    });
  });

  it("disables submit button while loading", async () => {
    const user = userEvent.setup();
    const signInStudentAction = vi.mocked(actions.signInStudentAction);
    signInStudentAction.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100)),
    );

    render(<StudentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "student@example.com");
    await user.type(screen.getByLabelText(/κωδικός/i), "password123");

    const submitButton = screen.getByRole("button", { name: /σύνδεση/i });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/σύνδεση\.\.\./i)).toBeInTheDocument();
  });
});
