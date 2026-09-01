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
  payment_method: 3,
  notes: null,
  mydata_status: "not_submitted" as const,
  mydata_mark: null,
  mydata_uid: null,
  mydata_error: null,
  mydata_submitted_at: null,
  mydata_environment: null,
  mydata_last_verified_at: null,
  mydata_last_verified_ok: null,
  emailed_at: null,
  created_at: "2026-08-20T00:00:00Z",
  counts_toward_balance: true,
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

  it("does not show the balance checkbox when no family is selected", async () => {
    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={business}
      />,
    );

    await userEvent.setup().click(
      screen.getByRole("button", { name: /new receipt/i }),
    );
    await screen.findByRole("dialog");

    expect(
      screen.queryByText(/counts toward this family's balance/i),
    ).not.toBeInTheDocument();
  });

  it("defaults the balance checkbox to checked once a family is selected, and passes it through as true", async () => {
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

    await user.selectOptions(
      screen.getByLabelText(/prefill from a family/i),
      "family-1",
    );

    const checkbox = screen.getByRole("checkbox", {
      name: /counts toward this family's balance/i,
    });
    expect(checkbox).toBeChecked();

    await user.type(
      screen.getByLabelText(/line 1 description/i),
      "Δίδακτρα Σεπτεμβρίου",
    );
    await user.type(screen.getByLabelText(/line 1 amount/i), "150");
    await user.click(screen.getByRole("button", { name: /issue receipt/i }));

    await waitFor(() => {
      expect(receiptActions.createReceiptAction).toHaveBeenCalledWith(
        expect.objectContaining({ countsTowardBalance: true }),
      );
    });
  });

  it("passes countsTowardBalance: false when the checkbox is unchecked", async () => {
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

    await user.selectOptions(
      screen.getByLabelText(/prefill from a family/i),
      "family-1",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /counts toward this family's balance/i,
      }),
    );

    await user.type(
      screen.getByLabelText(/line 1 description/i),
      "Εγγραφή",
    );
    await user.type(screen.getByLabelText(/line 1 amount/i), "50");
    await user.click(screen.getByRole("button", { name: /issue receipt/i }));

    await waitFor(() => {
      expect(receiptActions.createReceiptAction).toHaveBeenCalledWith(
        expect.objectContaining({ countsTowardBalance: false }),
      );
    });
  });

  it("shows a badge for a receipt not counted toward balance, and none for a normal one", () => {
    render(
      <TeacherReceipts
        initialReceipts={[
          existingReceipt,
          { ...existingReceipt, id: "receipt-2", counts_toward_balance: false },
        ]}
        families={families}
        business={business}
      />,
    );

    expect(
      screen.getAllByText("Not counted toward balance"),
    ).toHaveLength(1);
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

  it("prints the current-law VAT exemption citation, not the superseded one", async () => {
    // ν. 5144/2024 renumbered the VAT Code, moving this exemption from
    // άρθρο 22 to άρθρο 27. Asserted because it's a legally significant
    // string that would otherwise be free to drift unnoticed.
    const user = userEvent.setup();
    render(
      <TeacherReceipts
        initialReceipts={[
          { ...existingReceipt, vat_category: "exempt_article_27" },
        ]}
        families={families}
        business={business}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^view$/i }));

    expect(screen.getByText(/άρθρο 27 του Κώδικα ΦΠΑ/)).toBeInTheDocument();
    expect(screen.queryByText(/άρθρο 22/)).not.toBeInTheDocument();
  });

  it("still renders the original wording for a receipt issued under the old citation", async () => {
    // An already-issued receipt is a historical record - reprinting it must
    // reproduce what it said when issued, not silently restate it.
    const user = userEvent.setup();
    render(
      <TeacherReceipts
        initialReceipts={[
          { ...existingReceipt, vat_category: "exempt_article_22" },
        ]}
        families={families}
        business={business}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^view$/i }));

    expect(screen.getByText(/άρθρο 22 του Κώδικα ΦΠΑ/)).toBeInTheDocument();
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

  it("sends an unsent receipt to myDATA and shows the MARK", async () => {
    const user = userEvent.setup();
    const submitted = {
      ...existingReceipt,
      mydata_status: "submitted" as const,
      mydata_mark: "400001968145986",
      mydata_environment: "sandbox" as const,
    };
    vi.mocked(receiptActions.submitReceiptToMyDataAction).mockResolvedValue(
      submitted,
    );

    render(
      <TeacherReceipts
        initialReceipts={[existingReceipt]}
        families={families}
        business={business}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /send to mydata/i }),
    );

    await waitFor(() => {
      expect(receiptActions.submitReceiptToMyDataAction).toHaveBeenCalledWith(
        "receipt-1",
      );
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("400001968145986"),
      );
    });
    expect(screen.getByText(/myDATA sent \(sandbox\)/)).toBeInTheDocument();
  });

  it("shows a failed submission as retryable, not as sent", async () => {
    const user = userEvent.setup();
    vi.mocked(receiptActions.submitReceiptToMyDataAction).mockRejectedValue(
      new Error("myDATA rejected the receipt: Payment Methods is mandatory"),
    );

    render(
      <TeacherReceipts
        initialReceipts={[existingReceipt]}
        families={families}
        business={business}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /send to mydata/i }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Payment Methods is mandatory"),
      );
    });
    expect(screen.getByText("myDATA failed")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry mydata/i }),
    ).toBeInTheDocument();
  });

  it("verifies a submitted receipt and shows it confirmed", async () => {
    const user = userEvent.setup();
    const submitted = {
      ...existingReceipt,
      mydata_status: "submitted" as const,
      mydata_mark: "400001968145986",
      mydata_environment: "sandbox" as const,
    };
    const verified = {
      ...submitted,
      mydata_last_verified_at: "2026-08-20T18:00:00Z",
      mydata_last_verified_ok: true,
    };
    vi.mocked(receiptActions.verifyReceiptWithMyDataAction).mockResolvedValue(
      verified,
    );

    render(
      <TeacherReceipts
        initialReceipts={[submitted]}
        families={families}
        business={business}
      />,
    );

    // The "Send" button is gone once submitted - only Verify remains.
    expect(
      screen.queryByRole("button", { name: /send to mydata/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /verify with aade/i }),
    );

    await waitFor(() => {
      expect(
        receiptActions.verifyReceiptWithMyDataAction,
      ).toHaveBeenCalledWith("receipt-1");
    });
    expect(screen.getByText(/myDATA verified/)).toBeInTheDocument();
  });

  it("flags a receipt AADE has no record of, without pretending it wasn't checked", async () => {
    const user = userEvent.setup();
    const submitted = {
      ...existingReceipt,
      mydata_status: "submitted" as const,
      mydata_mark: "400001968145986",
      mydata_environment: "sandbox" as const,
    };
    vi.mocked(receiptActions.verifyReceiptWithMyDataAction).mockRejectedValue(
      new Error(
        "AADE has no record of MARK 400001968145986 in sandbox. This receipt may need to be re-sent.",
      ),
    );

    render(
      <TeacherReceipts
        initialReceipts={[submitted]}
        families={families}
        business={business}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /verify with aade/i }),
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("no record"),
      );
    });
    expect(screen.getByText(/myDATA sent — not confirmed/)).toBeInTheDocument();
  });
});

describe("TeacherReceipts - prefill hand-off from Billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the create dialog pre-filled with the family, amount, and payment method", () => {
    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={business}
        prefill={{ familyId: "family-1", amount: 45, paymentMethod: 7 }}
        onPrefillConsumed={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/issued to/i)).toHaveValue(
      "Μαρία Παπαδοπούλου",
    );
    expect(within(dialog).getByLabelText(/line 1 amount/i)).toHaveValue(45);
  });

  it("calls onPrefillConsumed exactly once so the parent can clear it", () => {
    const onPrefillConsumed = vi.fn();
    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={business}
        prefill={{ familyId: "family-1", amount: 45, paymentMethod: 7 }}
        onPrefillConsumed={onPrefillConsumed}
      />,
    );

    expect(onPrefillConsumed).toHaveBeenCalledTimes(1);
  });

  it("does nothing when prefill is null", () => {
    render(
      <TeacherReceipts
        initialReceipts={[]}
        families={families}
        business={business}
        prefill={null}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
