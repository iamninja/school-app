import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TeacherReceipts } from "@/components/teacher-receipts";
import * as receiptActions from "@/app/protected/teacher/receipt-actions";

vi.mock("@/app/protected/teacher/receipt-actions", () => ({
  createReceiptAction: vi.fn(),
  deleteReceiptAction: vi.fn(),
  listReceiptsAction: vi.fn(),
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

const families = [
  {
    id: "family-1",
    parentNames: ["Μαρία Παπαδοπούλου"],
    studentNames: ["Γιώργος"],
  },
];

const existingReceipt = {
  id: "receipt-1",
  series: "Α",
  receipt_number: 1,
  issue_date: "2026-08-20",
  recipient_name: "Γιώργος Παπαδόπουλος",
  recipient_afm: null,
  recipient_address: null,
  family_id: null,
  total_amount: 150,
  vat_category: "exempt_article_22",
  notes: null,
  mydata_status: "not_submitted" as const,
  mydata_mark: null,
  mydata_uid: null,
  mydata_error: null,
  mydata_submitted_at: null,
  emailed_at: null,
  created_at: "2026-08-20T00:00:00Z",
  lineItems: [
    {
      id: "line-1",
      student_id: null,
      description: "Δίδακτρα Σεπτεμβρίου",
      amount: 150,
      order_index: 0,
    },
  ],
};

describe("TeacherReceipts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks issuing until the business identity is filled in", () => {
    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={{ ...business, business_name: null, afm: null }}
      />,
    );

    expect(screen.getByRole("button", { name: /new receipt/i })).toBeDisabled();
    expect(screen.getByText(/business name and ΑΦΜ/i)).toBeInTheDocument();
  });

  it("enables issuing once the business identity exists", () => {
    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={business}
      />,
    );

    expect(
      screen.getByRole("button", { name: /new receipt/i }),
    ).toBeEnabled();
  });

  it("issues a receipt with the entered lines and opens the printable view", async () => {
    const user = userEvent.setup();
    vi.mocked(receiptActions.createReceiptAction).mockResolvedValue(
      existingReceipt,
    );

    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={business}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new receipt/i }));
    await screen.findByRole("dialog");

    await user.type(
      screen.getByLabelText(/issued to/i),
      "Γιώργος Παπαδόπουλος",
    );
    await user.type(
      screen.getByLabelText(/line 1 description/i),
      "Δίδακτρα Σεπτεμβρίου",
    );
    await user.type(screen.getByLabelText(/line 1 amount/i), "150");
    await user.click(screen.getByRole("button", { name: /issue receipt/i }));

    await waitFor(() => {
      expect(receiptActions.createReceiptAction).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientName: "Γιώργος Παπαδόπουλος",
          lineItems: [
            { description: "Δίδακτρα Σεπτεμβρίου", amount: 150 },
          ],
        }),
      );
    });

    // Lands straight on the printable receipt, ready to print.
    expect(
      await screen.findByText("ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /print \/ save as pdf/i }),
    ).toBeInTheDocument();
  });

  it("sends every line when more than one is added", async () => {
    const user = userEvent.setup();
    vi.mocked(receiptActions.createReceiptAction).mockResolvedValue(
      existingReceipt,
    );

    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={business}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new receipt/i }));
    const dialog = await screen.findByRole("dialog");

    await user.type(screen.getByLabelText(/issued to/i), "Πελάτης");
    await user.type(screen.getByLabelText(/line 1 description/i), "Δίδακτρα");
    await user.type(screen.getByLabelText(/line 1 amount/i), "150");

    await user.click(within(dialog).getByRole("button", { name: /add line/i }));
    await user.type(screen.getByLabelText(/line 2 description/i), "Εγγραφή");
    await user.type(screen.getByLabelText(/line 2 amount/i), "30");

    await user.click(screen.getByRole("button", { name: /issue receipt/i }));

    await waitFor(() => {
      expect(receiptActions.createReceiptAction).toHaveBeenCalledWith(
        expect.objectContaining({
          lineItems: [
            { description: "Δίδακτρα", amount: 150 },
            { description: "Εγγραφή", amount: 30 },
          ],
        }),
      );
    });
  });

  it("prefills the recipient name from a chosen family, and keeps it editable", async () => {
    const user = userEvent.setup();
    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={business}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new receipt/i }));
    await screen.findByRole("dialog");

    await user.selectOptions(
      screen.getByLabelText(/prefill from a family/i),
      "family-1",
    );

    const recipient = screen.getByLabelText(/issued to/i);
    expect(recipient).toHaveValue("Μαρία Παπαδοπούλου");

    await user.clear(recipient);
    await user.type(recipient, "Κάποιος άλλος");
    expect(recipient).toHaveValue("Κάποιος άλλος");
  });

  it("surfaces a server-side rejection as an error toast and stays on the form", async () => {
    const user = userEvent.setup();
    vi.mocked(receiptActions.createReceiptAction).mockRejectedValue(
      new Error("Add at least one line with an amount"),
    );

    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={business}
      />,
    );

    await user.click(screen.getByRole("button", { name: /new receipt/i }));
    await screen.findByRole("dialog");
    await user.type(screen.getByLabelText(/issued to/i), "Πελάτης");
    await user.click(screen.getByRole("button", { name: /issue receipt/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Add at least one line with an amount",
      );
    });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("lists an existing receipt and opens it for printing", async () => {
    const user = userEvent.setup();
    render(
      <TeacherReceipts
        initialReceipts={[existingReceipt]}
        families={families}
        business={business}
      />,
    );

    expect(screen.getByText(/Α-1 · Γιώργος Παπαδόπουλος/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^view$/i }));

    expect(
      screen.getByText("ΑΠΟΔΕΙΞΗ ΠΑΡΟΧΗΣ ΥΠΗΡΕΣΙΩΝ"),
    ).toBeInTheDocument();
    expect(screen.getByText("Δίδακτρα Σεπτεμβρίου")).toBeInTheDocument();
  });

  it("deletes a receipt after confirming, and does nothing when cancelled", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    vi.mocked(receiptActions.deleteReceiptAction).mockResolvedValue(undefined);

    render(
      <TeacherReceipts
        initialReceipts={[existingReceipt]}
        families={families}
        business={business}
      />,
    );

    await user.click(screen.getByRole("button", { name: /delete receipt/i }));
    expect(receiptActions.deleteReceiptAction).not.toHaveBeenCalled();
    expect(screen.getByText(/Α-1 · Γιώργος Παπαδόπουλος/)).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: /delete receipt/i }));

    await waitFor(() => {
      expect(receiptActions.deleteReceiptAction).toHaveBeenCalledWith(
        "receipt-1",
      );
    });
    expect(
      screen.queryByText(/Α-1 · Γιώργος Παπαδόπουλος/),
    ).not.toBeInTheDocument();

    confirmSpy.mockRestore();
  });
});
