import { describe, expect, it, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  createExpenseAction,
  deleteExpenseAction,
  listExpensesAction,
  updateExpenseAction,
} from "@/app/protected/teacher/expense-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

const expenseRow = {
  id: "expense-1",
  expense_date: "2026-08-21",
  supplier_name: "ΔΕΗ",
  supplier_afm: null,
  description: "Ρεύμα Αυγούστου",
  amount: "45.50",
  vat_amount: "8.73",
  category: "category2_4",
  payment_method: null,
  notes: null,
  created_at: "2026-08-21T00:00:00Z",
};

describe("expense actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("lists expenses with numeric amounts, not the numeric-as-string shape Postgres returns", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        expenses: { data: [expenseRow], error: null },
      }) as never,
    );

    const result = await listExpensesAction();

    expect(result[0].amount).toBe(45.5);
    expect(result[0].vat_amount).toBe(8.73);
    expect(typeof result[0].amount).toBe("number");
  });

  it("creates an expense with the normalized fields", async () => {
    const client = createMockSupabaseClient({
      expenses: { data: expenseRow, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createExpenseAction({
      supplierName: "  ΔΕΗ  ",
      description: "  Ρεύμα Αυγούστου  ",
      amount: 45.5,
      vatAmount: 8.73,
      category: "category2_4",
    });

    expect(client.from.mock.results[0].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        supplier_name: "ΔΕΗ",
        description: "Ρεύμα Αυγούστου",
        amount: 45.5,
        vat_amount: 8.73,
        category: "category2_4",
      }),
    );
  });

  it("rejects a blank supplier name", async () => {
    await expect(
      createExpenseAction({
        supplierName: "   ",
        description: "Something",
        amount: 10,
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a blank description", async () => {
    await expect(
      createExpenseAction({
        supplierName: "ΔΕΗ",
        description: "   ",
        amount: 10,
      }),
    ).rejects.toThrow(ExpectedError);
  });

  it("rejects a zero or negative amount", async () => {
    await expect(
      createExpenseAction({
        supplierName: "ΔΕΗ",
        description: "Ρεύμα",
        amount: 0,
      }),
    ).rejects.toThrow(/greater than zero/i);
  });

  it("rejects a negative VAT amount", async () => {
    await expect(
      createExpenseAction({
        supplierName: "ΔΕΗ",
        description: "Ρεύμα",
        amount: 10,
        vatAmount: -1,
      }),
    ).rejects.toThrow(/negative/i);
  });

  it("updates an existing expense", async () => {
    const client = createMockSupabaseClient({
      expenses: {
        data: { ...expenseRow, description: "Ρεύμα Σεπτεμβρίου" },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await updateExpenseAction("expense-1", {
      supplierName: "ΔΕΗ",
      description: "Ρεύμα Σεπτεμβρίου",
      amount: 45.5,
    });

    expect(result.description).toBe("Ρεύμα Σεπτεμβρίου");
    expect(client.from.mock.results[0].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ description: "Ρεύμα Σεπτεμβρίου" }),
    );
    expect(client.from.mock.results[0].value.eq).toHaveBeenCalledWith(
      "id",
      "expense-1",
    );
  });

  it("deletes an expense outright - no external system to keep in sync with", async () => {
    const client = createMockSupabaseClient({
      expenses: { data: null, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(deleteExpenseAction("expense-1")).resolves.toBeUndefined();
    expect(client.from.mock.results[0].value.delete).toHaveBeenCalled();
  });

  it("requires teacher authorization before touching any expense data", async () => {
    vi.mocked(requireTeacher).mockRejectedValue(
      new Error("Not authorized as a teacher"),
    );
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, { id: "parent-1" }) as never,
    );

    await expect(listExpensesAction()).rejects.toThrow(
      "Not authorized as a teacher",
    );
  });
});
