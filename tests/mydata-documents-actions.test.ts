import { describe, expect, it, vi, beforeEach } from "vitest";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { requestDocs } from "@/lib/mydata/client";
import { listMyDataDocumentsAction } from "@/app/protected/teacher/mydata-documents-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-teacher", () => ({
  requireTeacher: vi.fn(),
}));

vi.mock("@/lib/mydata/client", () => ({
  requestDocs: vi.fn(),
}));

const sampleInvoice = {
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
  downloadingInvoiceUrl: null,
};

describe("listMyDataDocumentsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, { id: "teacher-1" }) as never,
    );
    vi.mocked(requireTeacher).mockResolvedValue(undefined);
  });

  it("refuses an unauthenticated caller before calling myDATA", async () => {
    vi.mocked(createClient).mockResolvedValue(
      createMockSupabaseClient({}, null) as never,
    );

    await expect(listMyDataDocumentsAction({})).rejects.toThrow(
      "Not authenticated",
    );
    expect(requestDocs).not.toHaveBeenCalled();
  });

  it("refuses a non-teacher before calling myDATA", async () => {
    vi.mocked(requireTeacher).mockRejectedValue(
      new Error("Not authorized as a teacher"),
    );

    await expect(listMyDataDocumentsAction({})).rejects.toThrow(
      "Not authorized as a teacher",
    );
    expect(requestDocs).not.toHaveBeenCalled();
  });

  it("always queries the production environment, regardless of the app's active environment", async () => {
    vi.mocked(requestDocs).mockResolvedValue({
      ok: true,
      status: 200,
      invoices: [sampleInvoice],
    });

    await listMyDataDocumentsAction({});

    expect(requestDocs).toHaveBeenCalledWith(
      expect.objectContaining({ mark: "0", environment: "production" }),
    );
  });

  it("converts yyyy-MM-dd inputs to AADE's dd/MM/yyyy before calling requestDocs", async () => {
    vi.mocked(requestDocs).mockResolvedValue({
      ok: true,
      status: 200,
      invoices: [],
    });

    await listMyDataDocumentsAction({
      dateFrom: "2026-08-01",
      dateTo: "2026-08-24",
    });

    expect(requestDocs).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: "01/08/2026",
        dateTo: "24/08/2026",
      }),
    );
  });

  it("returns the invoices on success", async () => {
    vi.mocked(requestDocs).mockResolvedValue({
      ok: true,
      status: 200,
      invoices: [sampleInvoice],
    });

    const result = await listMyDataDocumentsAction({});
    expect(result).toEqual([sampleInvoice]);
  });

  it("throws an ExpectedError (not a raw error) when myDATA isn't configured", async () => {
    vi.mocked(requestDocs).mockResolvedValue({
      ok: false,
      error: 'No "user_id" credential set for production',
    });

    await expect(listMyDataDocumentsAction({})).rejects.toThrow(
      'No "user_id" credential set for production',
    );
  });
});
