import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TeacherReceipts } from "@/components/teacher-receipts";

vi.mock("@/app/protected/teacher/receipt-actions", () => ({
  createReceiptAction: vi.fn(),
  deleteReceiptAction: vi.fn(),
  listReceiptsAction: vi.fn(),
  previewReceiptCoverageAction: vi.fn(),
  submitReceiptToMyDataAction: vi.fn(),
  verifyReceiptWithMyDataAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const business = {
  id: 1,
  business_name: "Modus",
  afm: "123456789",
  doy: "Α ΑΘΗΝΩΝ",
  activity_code: "85.59",
  address: "Οδός 1",
  city: "Αθήνα",
  postal_code: "12345",
  phone: "2100000000",
  updated_at: "2026-08-20T00:00:00Z",
};

function receipt(id: string, number: number) {
  return {
    id,
    series: "Α",
    receipt_number: number,
    issue_date: "2026-08-20",
    recipient_name: "Γιώργος Παπαδόπουλος",
    recipient_afm: null,
    recipient_address: null,
    family_id: null,
    total_amount: 150,
    vat_category: "exempt_article_22",
    payment_method: 7,
    notes: null,
    mydata_status: "not_submitted" as const,
    mydata_mark: null,
    mydata_uid: null,
    mydata_error: null,
    mydata_submitted_at: null,
    mydata_environment: null,
    mydata_last_verified_at: null,
    mydata_last_verified_ok: null,
    mydata_warning: null,
    emailed_at: null,
    created_at: "2026-08-20T00:00:00Z",
    counts_toward_balance: true,
    lineItems: [
      {
        id: `line-${id}`,
        student_id: null,
        description: "Δίδακτρα Σεπτεμβρίου",
        amount: 150,
        order_index: 0,
      },
    ],
  };
}

describe("TeacherReceipts - print button", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    window.print = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the receipt and sends it to the printer after the short render delay", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <TeacherReceipts
        initialReceipts={[receipt("r1", 1)]}
        families={[]}
        business={business}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Print receipt Α-1" }),
    );

    // The printable document is on screen...
    expect(await screen.findByText("ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ")).toBeInTheDocument();
    // ...but print is deferred until it has rendered.
    expect(window.print).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it("only prints the receipt whose button was clicked, and View alone never prints", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <TeacherReceipts
        initialReceipts={[receipt("r1", 1), receipt("r2", 2)]}
        families={[]}
        business={business}
      />,
    );

    const viewButtons = screen.getAllByRole("button", { name: /^view$/i });
    await user.click(viewButtons[0]);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(window.print).not.toHaveBeenCalled();
  });

  it("the open receipt keeps its own Print / Save as PDF button", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    render(
      <TeacherReceipts
        initialReceipts={[receipt("r1", 1)]}
        families={[]}
        business={business}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^view$/i }));
    await user.click(
      await screen.findByRole("button", { name: /print \/ save as pdf/i }),
    );

    expect(window.print).toHaveBeenCalledTimes(1);
  });
});
