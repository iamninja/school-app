import { describe, expect, it } from "vitest";
import { toParentHistory, type LedgerHistoryRow } from "@/lib/billing/parent-history";

const T = "2026-10-01T10:00:00.000Z";

function row(overrides: Partial<LedgerHistoryRow>): LedgerHistoryRow {
  return {
    id: "row",
    type: "monthly_charge",
    amount: 110,
    description: "x",
    receipt_id: null,
    created_at: T,
    period: null,
    covering_receipt_id: null,
    ...overrides,
  };
}

describe("toParentHistory", () => {
  it("passes ordinary rows through unchanged", () => {
    const rows = [
      row({ id: "a", period: "2026-09-01", description: "Μηνιαία χρέωση 09/2026" }),
      row({ id: "b", type: "payment", amount: -50, created_at: "2026-09-20T00:00:00Z" }),
    ];

    const result = toParentHistory(rows);

    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result[0]).toEqual({
      id: "a",
      type: "monthly_charge",
      amount: 110,
      description: "Μηνιαία χρέωση 09/2026",
      createdAt: T,
      receiptId: null,
    });
  });

  it("folds receipt-tagged monthly charges into one line with the exact sum", () => {
    const months = ["2027-09-01", "2027-10-01", "2027-11-01"];
    const rows = months.map((period, i) =>
      row({ id: `c${i}`, period, covering_receipt_id: "r1", description: `m${i}` }),
    );

    const result = toParentHistory(rows);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "covered-r1",
      type: "monthly_charge",
      amount: 330,
      description: "Δίδακτρα 09/2027 – 11/2027 (3 μήνες)",
      receiptId: null,
    });
  });

  it("names a single covered month without a range and uses the singular", () => {
    const result = toParentHistory([
      row({ period: "2027-09-01", covering_receipt_id: "r1" }),
    ]);

    expect(result[0].description).toBe("Δίδακτρα 09/2027 (1 μήνας)");
  });

  it("keeps the discount and the receipt credit as their own rows", () => {
    const rows = [
      row({ id: "c1", period: "2027-09-01", covering_receipt_id: "r1" }),
      row({
        id: "disc",
        type: "adjustment",
        amount: -90,
        covering_receipt_id: "r1",
        description: "Έκπτωση",
      }),
      row({
        id: "credit",
        type: "receipt",
        amount: -400,
        receipt_id: "r1",
        description: "Απόδειξη Α5",
      }),
    ];

    const result = toParentHistory(rows);

    // Created in the same instant: receipt on top, then discount, then charges.
    expect(result.map((r) => r.id)).toEqual(["credit", "disc", "covered-r1"]);
    expect(result.find((r) => r.id === "credit")?.receiptId).toBe("r1");
  });

  it("preserves the balance: the sum of the output equals the sum of the input", () => {
    const rows = [
      row({ id: "old", amount: 110, created_at: "2026-09-01T00:00:00Z" }),
      ...["2027-09-01", "2027-10-01"].map((period, i) =>
        row({ id: `c${i}`, period, covering_receipt_id: "r1" }),
      ),
      row({ id: "disc", type: "adjustment", amount: -20, covering_receipt_id: "r1" }),
      row({ id: "credit", type: "receipt", amount: -150, receipt_id: "r1" }),
    ];

    const total = (items: Array<{ amount: number }>) =>
      items.reduce((sum, item) => sum + item.amount, 0);

    expect(total(toParentHistory(rows))).toBe(total(rows));
  });

  it("keeps separate lines for separate covering receipts, newest first", () => {
    const rows = [
      row({ id: "a", period: "2027-09-01", covering_receipt_id: "r1", created_at: "2026-10-01T00:00:00Z" }),
      row({ id: "b", period: "2028-09-01", covering_receipt_id: "r2", created_at: "2027-10-01T00:00:00Z" }),
    ];

    expect(toParentHistory(rows).map((r) => r.id)).toEqual([
      "covered-r2",
      "covered-r1",
    ]);
  });

  it("leaves a charge whose covering tag was cleared (month already started) as a normal row", () => {
    const result = toParentHistory([
      row({ id: "kept", period: "2026-09-01", covering_receipt_id: null }),
    ]);

    expect(result.map((r) => r.id)).toEqual(["kept"]);
  });
});
