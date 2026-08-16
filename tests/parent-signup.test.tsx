import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ParentSignUpForm } from "@/components/parent-signup-form";
import * as actions from "@/app/auth/parent/actions";

vi.mock("@/app/auth/parent/actions", () => ({
  checkParentEmailAction: vi.fn(),
  signUpParentAction: vi.fn(),
}));

vi.mock("@/app/auth/parent/diagnostic", () => ({
  diagnoseParentAccountAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

describe("ParentSignUpForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires email verification before showing password fields", async () => {
    render(<ParentSignUpForm />);

    expect(screen.queryByLabelText(/^κωδικός$/i)).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/επιβεβαίωση κωδικού/i),
    ).not.toBeInTheDocument();

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /επαλήθευση/i })).toBeInTheDocument();
  });

  it("shows error when email is not found in student_parents table", async () => {
    const user = userEvent.setup();
    const checkParentEmailAction = vi.mocked(actions.checkParentEmailAction);
    checkParentEmailAction.mockResolvedValue({
      exists: false,
      error:
        "No parent found with this email. Please contact your child's teacher.",
    });

    render(<ParentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "unknown@example.com");
    await user.click(screen.getByRole("button", { name: /επαλήθευση/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/no parent found with this email/i),
      ).toBeInTheDocument();
    });

    expect(screen.queryByLabelText(/^κωδικός$/i)).not.toBeInTheDocument();
  });

  it("shows error when email is already registered", async () => {
    const user = userEvent.setup();
    const checkParentEmailAction = vi.mocked(actions.checkParentEmailAction);
    checkParentEmailAction.mockResolvedValue({
      exists: false,
      error: "This email is already registered. Please login instead.",
    });

    render(<ParentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "registered@example.com");
    await user.click(screen.getByRole("button", { name: /επαλήθευση/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/already registered.*login instead/i),
      ).toBeInTheDocument();
    });
  });

  it("shows password fields after successful email verification", async () => {
    const user = userEvent.setup();
    const checkParentEmailAction = vi.mocked(actions.checkParentEmailAction);
    checkParentEmailAction.mockResolvedValue({
      exists: true,
      parentId: "parent-123",
      parentName: "Jane Doe",
      familyId: "family-123",
    });

    render(<ParentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /επαλήθευση/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/επαληθεύτηκε ως jane doe/i),
      ).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/^κωδικός$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/επιβεβαίωση κωδικού/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /δημιουργία λογαριασμού/i }),
    ).toBeInTheDocument();
  });

  it("validates that passwords match", async () => {
    const user = userEvent.setup();
    const checkParentEmailAction = vi.mocked(actions.checkParentEmailAction);
    checkParentEmailAction.mockResolvedValue({
      exists: true,
      parentId: "parent-123",
      parentName: "Jane Doe",
      familyId: "family-123",
    });

    render(<ParentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /επαλήθευση/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^κωδικός$/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^κωδικός$/i), "password123");
    await user.type(screen.getByLabelText(/επιβεβαίωση κωδικού/i), "different123");
    await user.click(screen.getByRole("button", { name: /δημιουργία λογαριασμού/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/οι κωδικοί δεν ταιριάζουν/i),
      ).toBeInTheDocument();
    });
  });

  it("validates minimum password length", async () => {
    const user = userEvent.setup();
    const checkParentEmailAction = vi.mocked(actions.checkParentEmailAction);
    checkParentEmailAction.mockResolvedValue({
      exists: true,
      parentId: "parent-123",
      parentName: "Jane Doe",
      familyId: "family-123",
    });

    render(<ParentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /επαλήθευση/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^κωδικός$/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^κωδικός$/i), "short");
    await user.type(screen.getByLabelText(/επιβεβαίωση κωδικού/i), "short");
    await user.click(screen.getByRole("button", { name: /δημιουργία λογαριασμού/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες/i),
      ).toBeInTheDocument();
    });
  });

  it("successfully creates account with valid data", async () => {
    const user = userEvent.setup();
    const checkParentEmailAction = vi.mocked(actions.checkParentEmailAction);
    const signUpParentAction = vi.mocked(actions.signUpParentAction);

    checkParentEmailAction.mockResolvedValue({
      exists: true,
      parentId: "parent-123",
      parentName: "Jane Doe",
      familyId: "family-123",
    });

    signUpParentAction.mockResolvedValue({ success: true });

    render(<ParentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /επαλήθευση/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^κωδικός$/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^κωδικός$/i), "password123");
    await user.type(screen.getByLabelText(/επιβεβαίωση κωδικού/i), "password123");
    await user.click(screen.getByRole("button", { name: /δημιουργία λογαριασμού/i }));

    await waitFor(() => {
      expect(signUpParentAction).toHaveBeenCalledWith({
        email: "jane@example.com",
        password: "password123",
      });
    });
  });

  it("shows error returned from signUpParentAction without navigating away", async () => {
    const user = userEvent.setup();
    const checkParentEmailAction = vi.mocked(actions.checkParentEmailAction);
    const signUpParentAction = vi.mocked(actions.signUpParentAction);

    checkParentEmailAction.mockResolvedValue({
      exists: true,
      parentId: "parent-123",
      parentName: "Jane Doe",
      familyId: "family-123",
    });

    signUpParentAction.mockResolvedValue({
      error: "Failed to link parent account",
    });

    render(<ParentSignUpForm />);

    await user.type(screen.getByLabelText(/email/i), "jane@example.com");
    await user.click(screen.getByRole("button", { name: /επαλήθευση/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/^κωδικός$/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/^κωδικός$/i), "password123");
    await user.type(screen.getByLabelText(/επιβεβαίωση κωδικού/i), "password123");
    await user.click(screen.getByRole("button", { name: /δημιουργία λογαριασμού/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/failed to link parent account/i),
      ).toBeInTheDocument();
    });
  });

  it("disables email field after verification", async () => {
    const user = userEvent.setup();
    const checkParentEmailAction = vi.mocked(actions.checkParentEmailAction);
    checkParentEmailAction.mockResolvedValue({
      exists: true,
      parentId: "parent-123",
      parentName: "Jane Doe",
      familyId: "family-123",
    });

    render(<ParentSignUpForm />);

    const emailInput = screen.getByLabelText(/email/i) as HTMLInputElement;

    await user.type(emailInput, "jane@example.com");
    await user.click(screen.getByRole("button", { name: /επαλήθευση/i }));

    await waitFor(() => {
      expect(emailInput).toBeDisabled();
    });

    expect(
      screen.queryByRole("button", { name: /επαλήθευση/i }),
    ).not.toBeInTheDocument();
  });
});
