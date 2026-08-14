import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParentLoginForm } from "@/components/parent-login-form";
import * as actions from "@/app/auth/parent/actions";
import * as diagnostic from "@/app/auth/parent/diagnostic";

vi.mock("@/app/auth/parent/actions", () => ({
  signInParentAction: vi.fn(),
}));

vi.mock("@/app/auth/parent/diagnostic", () => ({
  diagnoseParentAccountAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({
    get: vi.fn(),
  }),
}));

describe("ParentLoginForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders login form with email and password fields", () => {
    render(<ParentLoginForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^login$/i })).toBeInTheDocument();
  });

  it("shows link to sign up page", () => {
    render(<ParentLoginForm />);

    const signUpLink = screen.getByRole("link", { name: /sign up/i });
    expect(signUpLink).toBeInTheDocument();
    expect(signUpLink).toHaveAttribute("href", "/auth/parent-signup");
  });

  it("does not submit without email", async () => {
    const user = userEvent.setup();
    const signInParentAction = vi.mocked(actions.signInParentAction);

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /^login$/i }));

    expect(signInParentAction).not.toHaveBeenCalled();
  });

  it("does not submit without password", async () => {
    const user = userEvent.setup();
    const signInParentAction = vi.mocked(actions.signInParentAction);

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "parent@example.com");
    await user.click(screen.getByRole("button", { name: /^login$/i }));

    expect(signInParentAction).not.toHaveBeenCalled();
  });

  it("submits form with valid credentials", async () => {
    const user = userEvent.setup();
    const signInParentAction = vi.mocked(actions.signInParentAction);
    signInParentAction.mockResolvedValue({ success: true });

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "parent@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(signInParentAction).toHaveBeenCalledWith({
        email: "parent@example.com",
        password: "password123",
      });
    });
  });

  it("shows error message on failed login", async () => {
    const user = userEvent.setup();
    const signInParentAction = vi.mocked(actions.signInParentAction);
    signInParentAction.mockResolvedValue({
      error: "Invalid login credentials",
    });

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "parent@example.com");
    await user.type(screen.getByLabelText(/password/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/invalid login credentials/i),
      ).toBeInTheDocument();
    });
  });

  it("shows this account is not registered as a parent error", async () => {
    const user = userEvent.setup();
    const signInParentAction = vi.mocked(actions.signInParentAction);
    signInParentAction.mockResolvedValue({
      error: "This account is not registered as a parent",
    });

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "student@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");
    await user.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/not registered as a parent/i),
      ).toBeInTheDocument();
    });
  });

  it("disables submit button while loading", async () => {
    const user = userEvent.setup();
    const signInParentAction = vi.mocked(actions.signInParentAction);
    signInParentAction.mockImplementation(
      () =>
        new Promise((resolve) => setTimeout(() => resolve({ success: true }), 100)),
    );

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "parent@example.com");
    await user.type(screen.getByLabelText(/password/i), "password123");

    const submitButton = screen.getByRole("button", { name: /^login$/i });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/logging in/i)).toBeInTheDocument();
  });

  it("requires an email before running the account diagnostic", async () => {
    const user = userEvent.setup();
    const diagnoseParentAccountAction = vi.mocked(
      diagnostic.diagnoseParentAccountAction,
    );

    render(<ParentLoginForm />);

    await user.click(
      screen.getByRole("button", { name: /diagnose account issue/i }),
    );

    expect(diagnoseParentAccountAction).not.toHaveBeenCalled();
    expect(
      screen.getByText(/enter an email address to diagnose/i),
    ).toBeInTheDocument();
  });

  it("shows diagnostic results when the diagnose button is clicked", async () => {
    const user = userEvent.setup();
    const diagnoseParentAccountAction = vi.mocked(
      diagnostic.diagnoseParentAccountAction,
    );
    diagnoseParentAccountAction.mockResolvedValue({
      status: "not_registered",
      message: "Parent record exists but account not created yet",
      suggestion: "Use the Parent Sign Up page to create your account",
    });

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "parent@example.com");
    await user.click(
      screen.getByRole("button", { name: /diagnose account issue/i }),
    );

    await waitFor(() => {
      expect(diagnoseParentAccountAction).toHaveBeenCalledWith(
        "parent@example.com",
      );
      expect(
        screen.getByText(/account not created yet/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/use the parent sign up page/i),
      ).toBeInTheDocument();
    });
  });
});
