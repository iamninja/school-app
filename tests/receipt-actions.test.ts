import { describe, expect, it, vi, beforeEach } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  createReceiptAction,
  deleteReceiptAction,
} from "@/app/protected/teacher/receipt-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

const businessProfile = { business_name: "Modus", afm: "123456789" };

const receiptRow = {
  id: "receipt-1",
  series: "Α",
  receipt_number: 1,
  issue_date: "2026-08-20",
  recipient_name: "Γιώργος Παπαδόπουλος",
  recipient_afm: null,
  recipient_address: null,
  family_id: null,
  total_amount: "150.00",
  vat_category: "exempt_article_22",
  notes: null,
  mydata_status: "not_submitted",
  mydata_mark: null,
  mydata_uid: null,
  mydata_error: null,
  mydata_submitted_at: null,
  emailed_at: null,
  created_at: "2026-08-20T00:00:00Z",
};

function findChain(
  client: ReturnType<typeof createMockSupabaseClient>,
  table: string,
) {
  const index = client.from.mock.calls.findIndex(([t]) => t === table);
  if (index === -1) {
    throw new Error(`"${table}" was never queried`);
  }
  return client.from.mock.results[index].value;
}

function clientWith(
  overrides: Parameters<typeof createMockSupabaseClient>[0] = {},
) {
  const client = createMockSupabaseClient({
    business_profile: { data: businessProfile, error: null },
    receipts: { data: receiptRow, error: null },
    receipt_line_items: { data: [], error: null },
    ...overrides,
  });
  // next_receipt_number is an RPC, not a table query.
  (client as unknown as { rpc: unknown }).rpc = vi.fn(async () => ({
    data: 1,
    error: null,
  }));
  return client;
}

describe("createReceiptAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("allocates the receipt number through the atomic RPC, never a client-side count", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createReceiptAction({
      recipientName: "Γιώργος Παπαδόπουλος",
      lineItems: [{ description: "Δίδακτρα Σεπτεμβρίου", amount: 150 }],
    });

    const rpc = (client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).toHaveBeenCalledWith("next_receipt_number", {
      p_series: "Α",
    });
  });

  it("sums the line items into total_amount", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createReceiptAction({
      recipientName: "Γιώργος Παπαδόπουλος",
      lineItems: [
        { description: "Δίδακτρα", amount: 150 },
        { description: "Εγγραφή", amount: 30.5 },
      ],
    });

    expect(findChain(client, "receipts").insert).toHaveBeenCalledWith(
      expect.objectContaining({ total_amount: 180.5 }),
    );
  });

  it("writes one line-item row per line, in order", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await createReceiptAction({
      recipientName: "Γιώργος Παπαδόπουλος",
      lineItems: [
        { description: "Δίδακτρα", amount: 150 },
        { description: "Εγγραφή", amount: 30 },
      ],
    });

    expect(findChain(client, "receipt_line_items").insert).toHaveBeenCalledWith(
      [
        expect.objectContaining({ description: "Δίδακτρα", order_index: 0 }),
        expect.objectContaining({ description: "Εγγραφή", order_index: 1 }),
      ],
    );
  });

  it("refuses to issue a receipt before the business identity is filled in", async () => {
    const client = clientWith({
      business_profile: { data: { business_name: null, afm: null }, error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createReceiptAction({
        recipientName: "Γιώργος Παπαδόπουλος",
        lineItems: [{ description: "Δίδακτρα", amount: 150 }],
      }),
    ).rejects.toThrow(ExpectedError);

    // And crucially, no number was burned on the failed attempt.
    const rpc = (client as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc;
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a receipt with no usable lines", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createReceiptAction({
        recipientName: "Γιώργος Παπαδόπουλος",
        lineItems: [{ description: "", amount: 0 }],
      }),
    ).rejects.toThrow(/at least one line/i);
  });

  it("rejects a zero or negative amount", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createReceiptAction({
        recipientName: "Γιώργος Παπαδόπουλος",
        lineItems: [{ description: "Δίδακτρα", amount: 0 }],
      }),
    ).rejects.toThrow(/greater than zero/i);
  });

  it("rejects an empty recipient name", async () => {
    const client = clientWith();
    vi.mocked(createClient).mockResolvedValue(client as never);

    await expect(
      createReceiptAction({
        recipientName: "   ",
        lineItems: [{ description: "Δίδακτρα", amount: 150 }],
      }),
    ).rejects.toThrow(/who the receipt is for/i);
  });
});

describe("deleteReceiptAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("deletes a receipt that was never sent to myDATA", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        receipts: [
          { data: { id: "receipt-1", mydata_status: "not_submitted" }, error: null },
          { data: null, error: null },
        ],
      }) as never,
    );

    await expect(deleteReceiptAction("receipt-1")).resolves.toBeUndefined();
  });

  it("refuses to delete a receipt already transmitted to myDATA", async () => {
    // Local deletion would leave the books disagreeing with AADE - it has
    // to be cancelled through them instead.
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({
        receipts: {
          data: { id: "receipt-1", mydata_status: "submitted" },
          error: null,
        },
      }) as never,
    );

    await expect(deleteReceiptAction("receipt-1")).rejects.toThrow(
      /cancelled through AADE/i,
    );
  });
});
