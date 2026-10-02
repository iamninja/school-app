import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TeacherExpenses } from "@/components/teacher-expenses";
import * as expenseActions from "@/app/protected/teacher/expense-actions";
import * as myDataDocumentsActions from "@/app/protected/teacher/mydata-documents-actions";

vi.mock("@/app/protected/teacher/expense-actions", () => ({
  createExpenseAction: vi.fn(),
  updateExpenseAction: vi.fn(),
  deleteExpenseAction: vi.fn(),
  listExpensesAction: vi.fn(),
}));

vi.mock("@/app/protected/teacher/mydata-documents-actions", () => ({
  listMyDataDocumentsAction: vi.fn(),
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

  it("shows AADE's classification number (2.4) next to its description in the expense list", () => {
    render(<TeacherExpenses initialExpenses={[existingExpense]} />);

    expect(
      screen.getByText(/· 2\.4 — Γενικά Έξοδα \(με έκπτωση ΦΠΑ\)/),
    ).toBeInTheDocument();
  });

  it("falls back to the raw code in the list for a category it does not know", () => {
    render(
      <TeacherExpenses
        initialExpenses={[{ ...existingExpense, category: "category2_99" }]}
      />,
    );

    expect(screen.getByText(/· category2_99$/)).toBeInTheDocument();
  });

  it("shows the code with the description for every category in the form's dropdown", async () => {
    const user = userEvent.setup();
    render(<TeacherExpenses initialExpenses={[]} />);

    await user.click(screen.getByRole("button", { name: /new expense/i }));
    await screen.findByRole("dialog");

    const select = screen.getByLabelText(/category/i);
    const options = Array.from(
      (select as HTMLSelectElement).options,
    ).map((option) => option.textContent);

    // The empty choice is untouched.
    expect(options[0]).toBe("—");
    // Spot checks on the ones this tutoring business is likely to pick.
    expect(options).toContain("2.3 — Λήψη Υπηρεσιών");
    expect(options).toContain("2.4 — Γενικά Έξοδα (με έκπτωση ΦΠΑ)");
    expect(options).toContain("2.5 — Γενικά Έξοδα (χωρίς έκπτωση ΦΠΑ)");
    // Two-digit codes are not mangled (category2_10 is 2.10, not 2.1).
    expect(options).toContain("2.10 — Έξοδα προηγούμενων χρήσεων");
    // And every real option leads with its number, never a bare description.
    expect(options).toHaveLength(16);
    for (const text of options.slice(1)) {
      expect(text).toMatch(/^2\.\d+ — /);
    }
  });

  it("still saves the bare identifier, not the display text", async () => {
    const user = userEvent.setup();
    vi.mocked(expenseActions.createExpenseAction).mockResolvedValue({
      ...existingExpense,
      id: "expense-3",
    });
    render(<TeacherExpenses initialExpenses={[]} />);

    await user.click(screen.getByRole("button", { name: /new expense/i }));
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText(/paid to/i), "ΔΕΗ");
    await user.type(screen.getByLabelText(/what for/i), "Ρεύμα");
    await user.type(screen.getByLabelText(/amount paid/i), "10");
    await user.selectOptions(
      screen.getByLabelText(/category/i),
      "category2_4",
    );
    await user.click(screen.getByRole("button", { name: /log expense/i }));

    await waitFor(() => {
      expect(expenseActions.createExpenseAction).toHaveBeenCalledWith(
        expect.objectContaining({ category: "category2_4" }),
      );
    });
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

describe("TeacherExpenses - myDATA Documents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a prompt before the first check, not an empty-results message", () => {
    render(<TeacherExpenses initialExpenses={[]} />);
    expect(
      screen.getByText(/click "check mydata" to see what's on file/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/no documents found for this period/i),
    ).not.toBeInTheDocument();
  });

  it("renders retrieved documents after clicking Check myDATA", async () => {
    const user = userEvent.setup();
    vi.mocked(myDataDocumentsActions.listMyDataDocumentsAction).mockResolvedValue([
      {
        uid: "U1",
        mark: "1",
        issuerVatNumber: "999082935",
        counterpartVatNumber: "133341926",
        issueDate: "2026-08-24",
        invoiceType: "2.1",
        currency: "EUR",
        totalNetValue: 7.5,
        totalVatAmount: 1.8,
        totalGrossValue: 9.3,
        paymentMethods: [{ type: 7, amount: 9.3 }],
        qrCodeUrl: null,
        downloadingInvoiceUrl: "https://e-invoicing.gr/view/1",
      },
    ]);

    render(<TeacherExpenses initialExpenses={[]} />);
    await user.click(screen.getByRole("button", { name: /check mydata/i }));

    await waitFor(() => {
      expect(screen.getByText("999082935")).toBeInTheDocument();
    });
    expect(screen.getByText(/POS \/ e-POS/)).toBeInTheDocument();
    expect(screen.getByText("Τιμολόγιο Παροχής")).toBeInTheDocument();
    expect(screen.getByText("2.1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute(
      "href",
      "https://e-invoicing.gr/view/1",
    );
  });

  it("shows an empty-results message when nothing is found for the period", async () => {
    const user = userEvent.setup();
    vi.mocked(
      myDataDocumentsActions.listMyDataDocumentsAction,
    ).mockResolvedValue([]);

    render(<TeacherExpenses initialExpenses={[]} />);
    await user.click(screen.getByRole("button", { name: /check mydata/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/no documents found for this period/i),
      ).toBeInTheDocument();
    });
  });

  it("surfaces a failure (e.g. myDATA not configured) as an error toast", async () => {
    const user = userEvent.setup();
    vi.mocked(
      myDataDocumentsActions.listMyDataDocumentsAction,
    ).mockRejectedValue(
      new Error('No "user_id" credential set for production'),
    );

    render(<TeacherExpenses initialExpenses={[]} />);
    await user.click(screen.getByRole("button", { name: /check mydata/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        'No "user_id" credential set for production',
      );
    });
  });
});
