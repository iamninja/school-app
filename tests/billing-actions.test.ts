import { describe, expect, it, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  adjustFamilyBalanceAction,
  deleteFamilyBalanceTransactionAction,
  logFamilyPaymentAction,
  prepayFamilyMonthsAction,
  previewFamilyPrepaymentAction,
  runMonthlyChargesAction,
} from "@/app/protected/teacher/billing-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

const txnRow = {
  id: "txn-1",
  family_id: "family-1",
  type: "payment",
  amount: "-50.00",
  period: null,
  period_end: null,
  covers_months: null,
  description: "Πληρωμή",
  receipt_id: null,
  payment_method: 3,
  source: "manual",
  created_by: "teacher-1",
  created_at: "2026-08-25T00:00:00Z",
};

function clientWith(
  overrides: Parameters<typeof createMockSupabaseClient>[0] = {},
  rpcImpl?: (...args: unknown[]) => unknown,
) {
  const client = createMockSupabaseClient({
    family_balance_transactions: { data: txnRow, error: null },
    ...overrides,
  });
  (client as unknown as { rpc: unknown }).rpc =
    rpcImpl ?? vi.fn(async () => ({ data: null, error: null }));
  return client;
}

describe("billing-actions - authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logFamilyPaymentAction refuses an unauthenticated caller", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, null) as never,
    );

    await expect(
      logFamilyPaymentAction({ familyId: "family-1", amount: 50 }),
    ).rejects.toThrow("Not authenticated");
  });

  it("logFamilyPaymentAction refuses a non-teacher", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, { id: "parent-1" }) as never,
    );
    vi.mocked(requireTeacher).mockRejectedValue(
      new Error("Not authorized as a teacher"),
    );

    await expect(
      logFamilyPaymentAction({ familyId: "family-1", amount: 50 }),
    ).rejects.toThrow("Not authorized as a teacher");
  });
});

describe("logFamilyPaymentAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("inserts a NEGATIVE amount for a positive payment - the sign inversion happens in exactly one place", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await logFamilyPaymentAction({ familyId: "family-1", amount: 50 });

    const insertCall = client.from.mock.results.find(
      (result, index) =>
        client.from.mock.calls[index][0] === "family_balance_transactions",
    )!.value;
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({ family_id: "family-1", amount: -50, type: "payment" }),
    );
  });

  it("rejects a zero or negative amount as an ExpectedError", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      logFamilyPaymentAction({ familyId: "family-1", amount: 0 }),
    ).rejects.toBeInstanceOf(ExpectedError);
    await expect(
      logFamilyPaymentAction({ familyId: "family-1", amount: -5 }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("rejects a non-finite amount", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      logFamilyPaymentAction({ familyId: "family-1", amount: NaN }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("rejects a period that isn't the first of a month", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      logFamilyPaymentAction({
        familyId: "family-1",
        amount: 50,
        period: "2026-10-15",
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });
});

describe("previewFamilyPrepaymentAction / prepayFamilyMonthsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects months outside 1-12", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      previewFamilyPrepaymentAction({ familyId: "family-1", months: 0 }),
    ).rejects.toBeInstanceOf(ExpectedError);
    await expect(
      previewFamilyPrepaymentAction({ familyId: "family-1", months: 13 }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("prepayFamilyMonthsAction inserts a NEGATIVE total with the right period range and covers_months", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          periods: ["2026-09-01", "2026-10-01", "2026-11-01"],
          monthly_amount: "100.00",
          total: "300.00",
        },
      ],
      error: null,
    }));
    const client = clientWith(
      { family_balance_transactions: { data: txnRow, error: null } },
      rpc,
    );
    vi.mocked(createClient).mockResolvedValue(client as never);

    await prepayFamilyMonthsAction({ familyId: "family-1", months: 3 });

    const insertCall = client.from.mock.results.find(
      (_, index) =>
        client.from.mock.calls[index][0] === "family_balance_transactions",
    )!.value;
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        family_id: "family-1",
        type: "prepayment",
        amount: -300,
        period: "2026-09-01",
        period_end: "2026-11-01",
        covers_months: 3,
      }),
    );
  });
});

describe("adjustFamilyBalanceAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("passes a positive OR negative amount straight through unchanged", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await adjustFamilyBalanceAction({
      familyId: "family-1",
      amount: -25,
      description: "Discount",
    });

    const insertCall = client.from.mock.results.find(
      (_, index) =>
        client.from.mock.calls[index][0] === "family_balance_transactions",
    )!.value;
    expect(insertCall.insert).toHaveBeenCalledWith(
      expect.objectContaining({ amount: -25, type: "adjustment" }),
    );
  });

  it("requires a non-blank description", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      adjustFamilyBalanceAction({
        familyId: "family-1",
        amount: 10,
        description: "   ",
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("rejects a zero amount", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      adjustFamilyBalanceAction({
        familyId: "family-1",
        amount: 0,
        description: "Nothing",
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });
});

describe("deleteFamilyBalanceTransactionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("refuses to delete a receipt-typed row and does not call .delete()", async () => {
    const client = clientWith({
      family_balance_transactions: {
        data: { id: "txn-1", type: "receipt" },
        error: null,
      },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      deleteFamilyBalanceTransactionAction("txn-1"),
    ).rejects.toBeInstanceOf(ExpectedError);

    const chain = client.from.mock.results.find(
      (_, index) =>
        client.from.mock.calls[index][0] === "family_balance_transactions",
    )!.value;
    expect(chain.delete).not.toHaveBeenCalled();
  });

  it("deletes a non-receipt row", async () => {
    const client = clientWith({
      family_balance_transactions: [
        { data: { id: "txn-1", type: "adjustment" }, error: null },
        { data: null, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      deleteFamilyBalanceTransactionAction("txn-1"),
    ).resolves.toBeUndefined();
  });
});

describe("runMonthlyChargesAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("rejects a period that isn't the first of a month", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      runMonthlyChargesAction({ period: "2026-10-15" }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("rejects a period more than a year in the future", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      runMonthlyChargesAction({ period: "2099-01-01" }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("calls the rpc with source manual and the resolved period", async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          period: "2026-10-01",
          billable: true,
          families_charged: 2,
          total_amount: "200.00",
          skipped_reason: null,
        },
      ],
      error: null,
    }));
    const client = clientWith({}, rpc);
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await runMonthlyChargesAction({ period: "2026-10-01" });

    expect(rpc).toHaveBeenCalledWith(
      "post_monthly_family_charges",
      expect.objectContaining({ p_period: "2026-10-01", p_source: "manual" }),
    );
    expect(result.familiesCharged).toBe(2);
    expect(result.totalAmount).toBe(200);
  });
});
