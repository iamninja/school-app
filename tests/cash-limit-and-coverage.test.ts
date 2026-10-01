import { describe, expect, it, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  CASH_LIMIT_MESSAGE,
  CASH_PAYMENT_LIMIT,
  isCashAllowed,
} from "@/lib/payment-methods";
import {
  createReceiptAction,
  previewReceiptCoverageAction,
} from "@/app/protected/teacher/receipt-actions";
import {
  logFamilyPaymentAction,
  prepayFamilyMonthsAction,
} from "@/app/protected/teacher/billing-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

vi.mock("@/lib/mydata/client", () => ({
  getActiveMyDataEnvironment: vi.fn(),
  sendInvoiceXml: vi.fn(),
  verifyReceiptMark: vi.fn(),
}));

vi.mock("@/lib/mydata/invoice-xml", () => ({
  buildInvoiceXml: vi.fn(() => "<InvoicesDoc />"),
}));

const receiptRow = {
  id: "receipt-1",
  series: "Α",
  receipt_number: 1,
  issue_date: "2026-09-30",
  recipient_name: "Γιώργος Παπαδόπουλος",
  recipient_afm: null,
  recipient_address: null,
  family_id: "family-1",
  total_amount: "400.00",
  vat_category: "exempt_article_22",
  notes: null,
  mydata_status: "not_submitted",
  created_at: "2026-09-30T00:00:00Z",
};

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
  payment_method: 7,
  source: "manual",
  created_by: "teacher-1",
  created_at: "2026-09-30T00:00:00Z",
};

function receiptClient(rpcImpl?: (name: string) => unknown) {
  const client = createMockSupabaseClient({
    business_profile: {
      data: { business_name: "Modus", afm: "123456789" },
      error: null,
    },
    receipts: { data: receiptRow, error: null },
    receipt_line_items: { data: [], error: null },
  });
  (client as unknown as { rpc: unknown }).rpc = vi.fn(
    async (name: string) =>
      rpcImpl ? rpcImpl(name) : { data: 1, error: null },
  );
  return client;
}

function receiptsInsert(client: ReturnType<typeof createMockSupabaseClient>) {
  const index = client.from.mock.calls.findIndex(([t]) => t === "receipts");
  return client.from.mock.results[index].value.insert;
}

const baseReceipt = {
  recipientName: "Γιώργος Παπαδόπουλος",
  familyId: "family-1",
  lineItems: [{ description: "Δίδακτρα", amount: 400 }],
};

describe("isCashAllowed", () => {
  it("allows up to and including the limit, refuses above it", () => {
    expect(CASH_PAYMENT_LIMIT).toBe(500);
    expect(isCashAllowed(0.01)).toBe(true);
    expect(isCashAllowed(500)).toBe(true);
    expect(isCashAllowed(500.01)).toBe(false);
    expect(isCashAllowed(1000)).toBe(false);
  });
});

describe("createReceiptAction - cash limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("refuses a cash receipt above 500 with the cash-limit message", async () => {
    const client = receiptClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createReceiptAction({
        ...baseReceipt,
        paymentMethod: 3,
        lineItems: [{ description: "Δίδακτρα", amount: 600 }],
      }),
    ).rejects.toThrow(CASH_LIMIT_MESSAGE);
  });

  it("refuses when cash is the implicit default and the total is above 500", async () => {
    const client = receiptClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createReceiptAction({
        ...baseReceipt,
        lineItems: [{ description: "Δίδακτρα", amount: 500.01 }],
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("allows exactly 500 in cash", async () => {
    const client = receiptClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createReceiptAction({
      ...baseReceipt,
      paymentMethod: 3,
      lineItems: [{ description: "Δίδακτρα", amount: 500 }],
    });

    expect(receiptsInsert(client)).toHaveBeenCalledWith(
      expect.objectContaining({ payment_method: 3, total_amount: 500 }),
    );
  });

  it("allows more than 500 by card, transfer or IRIS", async () => {
    for (const method of [6, 7, 8]) {
      const client = receiptClient();
      vi.mocked(createClient).mockResolvedValue(client as never);

      await createReceiptAction({
        ...baseReceipt,
        paymentMethod: method,
        lineItems: [{ description: "Δίδακτρα", amount: 1000 }],
      });

      expect(receiptsInsert(client)).toHaveBeenCalledWith(
        expect.objectContaining({ payment_method: method, total_amount: 1000 }),
      );
    }
  });
});

describe("createReceiptAction - multi-month coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("passes the covered range and agreed amount through to the insert", async () => {
    const client = receiptClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createReceiptAction({
      ...baseReceipt,
      coversPeriodStart: "2026-09-01",
      coversPeriodEnd: "2027-05-01",
      agreedAmount: 1000,
    });

    expect(receiptsInsert(client)).toHaveBeenCalledWith(
      expect.objectContaining({
        covers_period_start: "2026-09-01",
        covers_period_end: "2027-05-01",
        covers_agreed_amount: 1000,
        counts_toward_balance: true,
      }),
    );
  });

  it("leaves the coverage columns null for an ordinary receipt", async () => {
    const client = receiptClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createReceiptAction(baseReceipt);

    expect(receiptsInsert(client)).toHaveBeenCalledWith(
      expect.objectContaining({
        covers_period_start: null,
        covers_period_end: null,
        covers_agreed_amount: null,
      }),
    );
  });

  it("rejects a range with only one end", async () => {
    vi.mocked(createClient).mockResolvedValue(receiptClient() as never);

    await expect(
      createReceiptAction({ ...baseReceipt, coversPeriodStart: "2026-09-01" }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("rejects months that are not the first of the month", async () => {
    vi.mocked(createClient).mockResolvedValue(receiptClient() as never);

    await expect(
      createReceiptAction({
        ...baseReceipt,
        coversPeriodStart: "2026-09-15",
        coversPeriodEnd: "2027-05-01",
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("rejects an end month before the start month", async () => {
    vi.mocked(createClient).mockResolvedValue(receiptClient() as never);

    await expect(
      createReceiptAction({
        ...baseReceipt,
        coversPeriodStart: "2027-05-01",
        coversPeriodEnd: "2026-09-01",
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("requires a family", async () => {
    vi.mocked(createClient).mockResolvedValue(receiptClient() as never);

    await expect(
      createReceiptAction({
        ...baseReceipt,
        familyId: null,
        coversPeriodStart: "2026-09-01",
        coversPeriodEnd: "2027-05-01",
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("refuses a covering receipt that doesn't count toward the balance", async () => {
    vi.mocked(createClient).mockResolvedValue(receiptClient() as never);

    await expect(
      createReceiptAction({
        ...baseReceipt,
        countsTowardBalance: false,
        coversPeriodStart: "2026-09-01",
        coversPeriodEnd: "2027-05-01",
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });

  it("refuses an agreed price without a range, or a non-positive one with a range", async () => {
    vi.mocked(createClient).mockResolvedValue(receiptClient() as never);

    await expect(
      createReceiptAction({ ...baseReceipt, agreedAmount: 1000 }),
    ).rejects.toBeInstanceOf(ExpectedError);
    await expect(
      createReceiptAction({
        ...baseReceipt,
        coversPeriodStart: "2026-09-01",
        coversPeriodEnd: "2027-05-01",
        agreedAmount: 0,
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
  });
});

describe("previewReceiptCoverageAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("maps the RPC row to the camelCase preview", async () => {
    const client = receiptClient(() => ({
      data: [
        {
          periods: ["2026-09-01", "2026-10-01"],
          monthly_amount: "120.00",
          already_posted_total: "120.00",
          new_charges_total: "120.00",
          gross: "240.00",
          balance: "120.00",
        },
      ],
      error: null,
    }));
    vi.mocked(createClient).mockResolvedValue(client as never);

    const preview = await previewReceiptCoverageAction({
      familyId: "family-1",
      start: "2026-09-01",
      end: "2026-10-01",
    });

    expect(preview).toEqual({
      periods: ["2026-09-01", "2026-10-01"],
      monthlyAmount: 120,
      alreadyPostedTotal: 120,
      newChargesTotal: 120,
      grossTotal: 240,
      balance: 120,
    });
    expect(
      (client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc,
    ).toHaveBeenCalledWith("preview_receipt_coverage", {
      p_family_id: "family-1",
      p_start: "2026-09-01",
      p_end: "2026-10-01",
    });
  });

  it("rejects non-first-of-month dates before calling the database", async () => {
    const client = receiptClient();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      previewReceiptCoverageAction({
        familyId: "family-1",
        start: "2026-09-10",
        end: "2026-10-01",
      }),
    ).rejects.toBeInstanceOf(ExpectedError);
    expect(
      (client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc,
    ).not.toHaveBeenCalled();
  });

  it("surfaces a database error as an ExpectedError message", async () => {
    const client = receiptClient(() => ({
      data: null,
      error: { message: "This family has no monthly tuition to cover" },
    }));
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      previewReceiptCoverageAction({
        familyId: "family-1",
        start: "2026-09-01",
        end: "2026-10-01",
      }),
    ).rejects.toThrow("no monthly tuition");
  });
});

describe("billing actions - cash limit", () => {
  function billingClient(rpcRow?: Record<string, unknown>) {
    const client = createMockSupabaseClient({
      family_balance_transactions: { data: txnRow, error: null },
    });
    (client as unknown as { rpc: unknown }).rpc = vi.fn(async () => ({
      data: rpcRow ? [rpcRow] : null,
      error: null,
    }));
    return client;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("logFamilyPaymentAction refuses cash above 500 and accepts exactly 500", async () => {
    vi.mocked(createClient).mockResolvedValue(billingClient() as never);

    await expect(
      logFamilyPaymentAction({
        familyId: "family-1",
        amount: 500.01,
        paymentMethod: 3,
      }),
    ).rejects.toThrow(CASH_LIMIT_MESSAGE);
    // Cash is also the default when no method is given.
    await expect(
      logFamilyPaymentAction({ familyId: "family-1", amount: 600 }),
    ).rejects.toBeInstanceOf(ExpectedError);

    await expect(
      logFamilyPaymentAction({
        familyId: "family-1",
        amount: 500,
        paymentMethod: 3,
      }),
    ).resolves.toBeDefined();
  });

  it("logFamilyPaymentAction allows a large payment by card", async () => {
    vi.mocked(createClient).mockResolvedValue(billingClient() as never);

    await expect(
      logFamilyPaymentAction({
        familyId: "family-1",
        amount: 1000,
        paymentMethod: 7,
      }),
    ).resolves.toBeDefined();
  });

  it("prepayFamilyMonthsAction checks the final total, including an amountOverride", async () => {
    const preview = {
      periods: ["2026-10-01", "2026-11-01", "2026-12-01"],
      monthly_amount: "200.00",
      total: "600.00",
    };
    vi.mocked(createClient).mockResolvedValue(billingClient(preview) as never);

    // Preview total is 600: cash refused.
    await expect(
      prepayFamilyMonthsAction({
        familyId: "family-1",
        months: 3,
        paymentMethod: 3,
      }),
    ).rejects.toThrow(CASH_LIMIT_MESSAGE);

    // A discounted override of 480 brings it under the limit: cash allowed.
    await expect(
      prepayFamilyMonthsAction({
        familyId: "family-1",
        months: 3,
        amountOverride: 480,
        paymentMethod: 3,
      }),
    ).resolves.toBeDefined();
  });
});
