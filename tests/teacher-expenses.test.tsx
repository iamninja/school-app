import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TeacherExpenses } from "@/components/teacher-expenses";
import * as expenseActions from "@/app/protected/teacher/expense-actions";

vi.mock("@/app/protected/teacher/expense-actions", () => ({
  createExpenseAction: vi.fn(),
  updateExpenseAction: vi.fn(),
  deleteExpenseAction: vi.fn(),
  listExpensesAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const existingExpense = {
  id: "expense-1",
  expense_date: "2026-08-21",
  supplier_name: "ΔΕΗ",
  supplier_afm: null,
  description: "Ρεύμα Αυγούστου",
  amount: 45.5,
  vat_amount: 8.73,
  category: "category2_4",
  payment_method: null,
  notes: null,
  created_at: "2026-08-21T00:00:00Z",
};

describe("TeacherExpenses", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state with no expenses", () => {
    render(<TeacherExpenses initialExpenses={[]} />);
    expect(screen.getByText(/no expenses logged yet/i)).toBeInTheDocument();
  });

  it("lists an existing expense and its running total", () => {
    render(<TeacherExpenses initialExpenses={[existingExpense]} />);

    expect(screen.getByText(/ΔΕΗ — 45,50/)).toBeInTheDocument();
    expect(screen.getByText(/Ρεύμα Αυγούστου/)).toBeInTheDocument();
    expect(screen.getByText(/Total: 45,50/)).toBeInTheDocument();
  });

  it("logs a new expense", async () => {
    const user = userEvent.setup();
    const created = { ...existingExpense, id: "expense-2" };
    vi.mocked(expenseActions.createExpenseAction).mockResolvedValue(created);

    render(<TeacherExpenses initialExpenses={[]} />);

    await user.click(screen.getByRole("button", { name: /new expense/i }));
    await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/paid to/i), "ΔΕΗ");
    await user.type(screen.getByLabelText(/what for/i), "Ρεύμα Αυγούστου");
    await user.type(screen.getByLabelText(/amount paid/i), "45.5");

    await user.click(screen.getByRole("button", { name: /log expense/i }));

    await waitFor(() => {
      expect(expenseActions.createExpenseAction).toHaveBeenCalledWith(
        expect.objectContaining({
          supplierName: "ΔΕΗ",
          description: "Ρεύμα Αυγούστου",
          amount: 45.5,
        }),
      );
      expect(toast.success).toHaveBeenCalledWith("Expense logged");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("edits an existing expense, pre-filling the form", async () => {
    const user = userEvent.setup();
    const updated = { ...existingExpense, description: "Ρεύμα Σεπτεμβρίου" };
    vi.mocked(expenseActions.updateExpenseAction).mockResolvedValue(updated);

    render(<TeacherExpenses initialExpenses={[existingExpense]} />);

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    const dialog = await screen.findByRole("dialog");

    expect(screen.getByLabelText(/paid to/i)).toHaveValue("ΔΕΗ");
    expect(screen.getByLabelText(/amount paid/i)).toHaveValue(45.5);

    const description = screen.getByLabelText(/what for/i);
    await user.clear(description);
    await user.type(description, "Ρεύμα Σεπτεμβρίου");
    await user.click(
      screen.getByRole("button", { name: /save changes/i }),
    );

    await waitFor(() => {
      expect(expenseActions.updateExpenseAction).toHaveBeenCalledWith(
        "expense-1",
        expect.objectContaining({ description: "Ρεύμα Σεπτεμβρίου" }),
      );
    });
    expect(screen.getByText(/Ρεύμα Σεπτεμβρίου/)).toBeInTheDocument();
    void dialog;
  });

  it("deletes an expense after confirming, and does nothing when cancelled", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.mocked(expenseActions.deleteExpenseAction).mockResolvedValue(undefined);

    render(<TeacherExpenses initialExpenses={[existingExpense]} />);

    await user.click(
      screen.getByRole("button", { name: /delete expense/i }),
    );
    expect(expenseActions.deleteExpenseAction).not.toHaveBeenCalled();
    expect(screen.getByText(/ΔΕΗ — 45,50/)).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    await user.click(
      screen.getByRole("button", { name: /delete expense/i }),
    );

    await waitFor(() => {
      expect(expenseActions.deleteExpenseAction).toHaveBeenCalledWith(
        "expense-1",
      );
    });
    expect(screen.getByText(/no expenses logged yet/i)).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  it("surfaces a validation rejection as an error toast and stays on the form", async () => {
    const user = userEvent.setup();
    vi.mocked(expenseActions.createExpenseAction).mockRejectedValue(
      new Error("Amount must be greater than zero"),
    );

    render(<TeacherExpenses initialExpenses={[]} />);

    await user.click(screen.getByRole("button", { name: /new expense/i }));
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText(/paid to/i), "ΔΕΗ");
    await user.type(screen.getByLabelText(/what for/i), "Ρεύμα");
    await user.click(screen.getByRole("button", { name: /log expense/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Amount must be greater than zero",
      );
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
