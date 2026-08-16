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
    expect(screen.getByLabelText(/κωδικός/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /^σύνδεση$/i }),
    ).toBeInTheDocument();
  });

  it("shows link to sign up page", () => {
    render(<ParentLoginForm />);

    const signUpLink = screen.getByRole("link", { name: /εγγραφή/i });
    expect(signUpLink).toBeInTheDocument();
    expect(signUpLink).toHaveAttribute("href", "/auth/parent-signup");
  });

  it("shows link to forgot password page", () => {
    render(<ParentLoginForm />);

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
    const signInParentAction = vi.mocked(actions.signInParentAction);

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/κωδικός/i), "password123");
    await user.click(screen.getByRole("button", { name: /^σύνδεση$/i }));

    expect(signInParentAction).not.toHaveBeenCalled();
  });

  it("does not submit without password", async () => {
    const user = userEvent.setup();
    const signInParentAction = vi.mocked(actions.signInParentAction);

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "parent@example.com");
    await user.click(screen.getByRole("button", { name: /^σύνδεση$/i }));

    expect(signInParentAction).not.toHaveBeenCalled();
  });

  it("submits form with valid credentials", async () => {
    const user = userEvent.setup();
    const signInParentAction = vi.mocked(actions.signInParentAction);
    signInParentAction.mockResolvedValue({ success: true });

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "parent@example.com");
    await user.type(screen.getByLabelText(/κωδικός/i), "password123");
    await user.click(screen.getByRole("button", { name: /^σύνδεση$/i }));

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
    await user.type(screen.getByLabelText(/κωδικός/i), "wrongpassword");
    await user.click(screen.getByRole("button", { name: /^σύνδεση$/i }));

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
    await user.type(screen.getByLabelText(/κωδικός/i), "password123");
    await user.click(screen.getByRole("button", { name: /^σύνδεση$/i }));

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
    await user.type(screen.getByLabelText(/κωδικός/i), "password123");

    const submitButton = screen.getByRole("button", { name: /^σύνδεση$/i });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/σύνδεση\.\.\./i)).toBeInTheDocument();
  });

  it("requires an email before running the account diagnostic", async () => {
    const user = userEvent.setup();
    const diagnoseParentAccountAction = vi.mocked(
      diagnostic.diagnoseParentAccountAction,
    );

    render(<ParentLoginForm />);

    await user.click(
      screen.getByRole("button", { name: /διάγνωση προβλήματος/i }),
    );

    expect(diagnoseParentAccountAction).not.toHaveBeenCalled();
    expect(
      screen.getByText(/εισάγετε ένα email για διάγνωση/i),
    ).toBeInTheDocument();
  });

  it("shows diagnostic results when the diagnose button is clicked", async () => {
    const user = userEvent.setup();
    const diagnoseParentAccountAction = vi.mocked(
      diagnostic.diagnoseParentAccountAction,
    );
    diagnoseParentAccountAction.mockResolvedValue({
      status: "not_registered",
      message:
        "Ο γονέας υπάρχει στο σύστημα αλλά ο λογαριασμός δεν έχει δημιουργηθεί ακόμα",
      suggestion:
        "Χρησιμοποιήστε τη σελίδα εγγραφής γονέα για να δημιουργήσετε τον λογαριασμό σας",
    });

    render(<ParentLoginForm />);

    await user.type(screen.getByLabelText(/email/i), "parent@example.com");
    await user.click(
      screen.getByRole("button", { name: /διάγνωση προβλήματος/i }),
    );

    await waitFor(() => {
      expect(diagnoseParentAccountAction).toHaveBeenCalledWith(
        "parent@example.com",
      );
      expect(
        screen.getByText(/δεν έχει δημιουργηθεί ακόμα/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/σελίδα εγγραφής γονέα/i),
      ).toBeInTheDocument();
    });
  });
});
