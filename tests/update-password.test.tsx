import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdatePasswordForm } from "@/components/update-password-form";

const updateUser = vi.fn();
const push = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { updateUser },
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

describe("UpdatePasswordForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the new password field", () => {
    render(<UpdatePasswordForm />);

    expect(screen.getByLabelText(/new password/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /save new password/i }),
    ).toBeInTheDocument();
  });

  it("shows an error message when the update fails", async () => {
    const user = userEvent.setup();
    updateUser.mockResolvedValue({
      data: { user: null },
      error: new Error("Auth session missing"),
    });

    render(<UpdatePasswordForm />);

    await user.type(screen.getByLabelText(/new password/i), "newpassword123");
    await user.click(
      screen.getByRole("button", { name: /save new password/i }),
    );

    await waitFor(() => {
      expect(screen.getByText(/auth session missing/i)).toBeInTheDocument();
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("redirects to the student dashboard for a student account", async () => {
    const user = userEvent.setup();
    updateUser.mockResolvedValue({
      data: { user: { user_metadata: { role: "student" } } },
      error: null,
    });

    render(<UpdatePasswordForm />);

    await user.type(screen.getByLabelText(/new password/i), "newpassword123");
    await user.click(
      screen.getByRole("button", { name: /save new password/i }),
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/student-dashboard");
    });
  });

  it("redirects to the parent dashboard for a parent account", async () => {
    const user = userEvent.setup();
    updateUser.mockResolvedValue({
      data: { user: { user_metadata: { role: "parent" } } },
      error: null,
    });

    render(<UpdatePasswordForm />);

    await user.type(screen.getByLabelText(/new password/i), "newpassword123");
    await user.click(
      screen.getByRole("button", { name: /save new password/i }),
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/parent-dashboard");
    });
  });

  it("redirects to the teacher dashboard when there is no role metadata", async () => {
    const user = userEvent.setup();
    updateUser.mockResolvedValue({
      data: { user: { user_metadata: {} } },
      error: null,
    });

    render(<UpdatePasswordForm />);

    await user.type(screen.getByLabelText(/new password/i), "newpassword123");
    await user.click(
      screen.getByRole("button", { name: /save new password/i }),
    );

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/protected/teacher");
    });
  });

  it("disables submit button while loading", async () => {
    const user = userEvent.setup();
    updateUser.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: { user: { user_metadata: {} } },
                error: null,
              }),
            100,
          ),
        ),
    );

    render(<UpdatePasswordForm />);

    await user.type(screen.getByLabelText(/new password/i), "newpassword123");

    const submitButton = screen.getByRole("button", {
      name: /save new password/i,
    });
    await user.click(submitButton);

    expect(submitButton).toBeDisabled();
    expect(screen.getByText(/saving/i)).toBeInTheDocument();
  });
});
