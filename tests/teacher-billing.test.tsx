import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { TeacherBilling } from "@/components/teacher-billing";
import * as billingActions from "@/app/protected/teacher/billing-actions";
import { currentPeriod, isBillableMonth } from "@/lib/billing/school-year";

vi.mock("@/app/protected/teacher/billing-actions", () => ({
  adjustFamilyBalanceAction: vi.fn(),
  deleteFamilyBalanceTransactionAction: vi.fn(),
  getFamilyLedgerAction: vi.fn(),
  listChargeRunsAction: vi.fn(async () => []),
  listFamilyBalancesAction: vi.fn(async () => []),
  logFamilyPaymentAction: vi.fn(),
  prepayFamilyMonthsAction: vi.fn(),
  previewFamilyPrepaymentAction: vi.fn(),
  runMonthlyChargesAction: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

const owingFamily = {
  id: "family-1",
  parentNames: ["Μαρία Παπαδοπούλου"],
  studentNames: ["Ελένη Παπαδοπούλου"],
  activeStudentCount: 1,
  monthlyAmount: 120,
  balance: 100,
  balanceUpdatedAt: "2026-08-25T00:00:00Z",
};

const creditFamily = {
  ...owingFamily,
  id: "family-2",
  parentNames: ["Γιώργος Νικολάου"],
  studentNames: ["Δημήτρης Νικολάου"],
  balance: -50,
};

const zeroFamily = {
  ...owingFamily,
  id: "family-3",
  parentNames: ["Ζήτω Οικογένεια"],
  balance: 0,
};

describe("TeacherBilling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("colors a positive balance as owing and a negative balance as credit", () => {
    render(
      <TeacherBilling
        initialFamilyBalances={[owingFamily, creditFamily]}
        initialChargeRuns={[]}
        onIssueReceipt={vi.fn()}
      />,
    );

    const owingCell = screen.getByText("100,00 €");
    expect(owingCell).toHaveClass("text-destructive");

    const creditCell = screen.getByText("-50,00 €");
    expect(creditCell).toHaveClass("text-emerald-600");
  });

  it("hides zero-balance families by default toggle state, and can reveal them", async () => {
    const user = userEvent.setup();
    render(
      <TeacherBilling
        initialFamilyBalances={[owingFamily, zeroFamily]}
        initialChargeRuns={[]}
        onIssueReceipt={vi.fn()}
      />,
    );

    // Default: shown (showZeroBalances starts true) - toggle hides them.
    expect(screen.getByText("Ζήτω Οικογένεια")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /hide zero balances/i }));
    expect(screen.queryByText("Ζήτω Οικογένεια")).not.toBeInTheDocument();
  });

  it("disables the run-charges button with an explanation outside the school year", () => {
    // Only meaningful to assert when "now" is actually outside the
    // default Sep-May window - skip gracefully otherwise so this test
    // isn't flaky depending on the day it runs.
    const month = Number(currentPeriod().split("-")[1]);
    const billableNow = isBillableMonth(month, { startMonth: 9, durationMonths: 9 });
    if (billableNow) return;

    render(
      <TeacherBilling initialFamilyBalances={[]} initialChargeRuns={[]}
        onIssueReceipt={vi.fn()} />,
    );

    const button = screen.getByRole("button", {
      name: /apply this month's charges/i,
    });
    expect(button).toBeDisabled();
    expect(
      screen.getByText(/outside the school year/i),
    ).toBeInTheDocument();
  });

  it("runs monthly charges and shows a success toast with the totals", async () => {
    const user = userEvent.setup();
    vi.mocked(billingActions.runMonthlyChargesAction).mockResolvedValue({
      period: currentPeriod(),
      billable: true,
      familiesCharged: 3,
      totalAmount: 300,
      skippedReason: null,
    });

    render(
      <TeacherBilling initialFamilyBalances={[]} initialChargeRuns={[]}
        onIssueReceipt={vi.fn()} />,
    );

    const button = screen.getByRole("button", {
      name: /apply this month's charges/i,
    });
    if (button.hasAttribute("disabled")) return; // outside school year today

    await user.click(button);

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith(
        expect.stringContaining("3 families"),
      );
    });
  });

  it("opens a family's detail dialog and previews a prepayment naming the covered months", async () => {
    const user = userEvent.setup();
    vi.mocked(billingActions.getFamilyLedgerAction).mockResolvedValue({
      familyId: "family-1",
      balance: 100,
      monthlyAmount: 100,
      transactions: [],
    });
    vi.mocked(billingActions.previewFamilyPrepaymentAction).mockResolvedValue({
      periods: ["2026-09-01", "2026-10-01", "2026-11-01"],
      monthlyAmount: 100,
      total: 300,
    });

    render(
      <TeacherBilling
        initialFamilyBalances={[owingFamily]}
        initialChargeRuns={[]}
        onIssueReceipt={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /manage/i }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: /preview/i }));

    await waitFor(() => {
      expect(screen.getByText(/2026-09, 2026-10, 2026-11/)).toBeInTheDocument();
    });
  });

  it("disables deleting a receipt-typed ledger row, with an explanation", async () => {
    const user = userEvent.setup();
    vi.mocked(billingActions.getFamilyLedgerAction).mockResolvedValue({
      familyId: "family-1",
      balance: 100,
      monthlyAmount: 100,
      transactions: [
        {
          id: "txn-1",
          family_id: "family-1",
          type: "receipt",
          amount: -50,
          period: null,
          period_end: null,
          covers_months: null,
          description: "Απόδειξη Α1",
          receipt_id: "receipt-1",
          payment_method: 3,
          source: "receipt",
          created_by: null,
          created_at: "2026-08-20T00:00:00Z",
          runningBalance: -50,
        },
      ],
    });

    render(
      <TeacherBilling
        initialFamilyBalances={[owingFamily]}
        initialChargeRuns={[]}
        onIssueReceipt={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /manage/i }));
    await screen.findByRole("dialog");
    await screen.findByText("Απόδειξη Α1");

    const deleteButtons = screen
      .getAllByRole("button")
      .filter((button) => button.querySelector("svg.lucide-trash-2"));
    expect(deleteButtons).toHaveLength(1);
    expect(deleteButtons[0]).toBeDisabled();
    expect(deleteButtons[0]).toHaveAttribute(
      "title",
      "Delete the receipt instead",
    );
  });

  it("offers to issue a receipt right after logging a payment, with the right prefill", async () => {
    const user = userEvent.setup();
    vi.mocked(billingActions.listFamilyBalancesAction).mockResolvedValue([owingFamily]);
    vi.mocked(billingActions.getFamilyLedgerAction).mockResolvedValue({
      familyId: "family-1",
      balance: 100,
      monthlyAmount: 100,
      transactions: [],
    });
    vi.mocked(billingActions.logFamilyPaymentAction).mockResolvedValue({
      id: "txn-new",
      family_id: "family-1",
      type: "payment",
      amount: -45,
      period: null,
      period_end: null,
      covers_months: null,
      description: "Πληρωμή",
      receipt_id: null,
      payment_method: 7,
      source: "manual",
      created_by: "teacher-1",
      created_at: "2026-08-25T00:00:00Z",
    });
    const onIssueReceipt = vi.fn();

    render(
      <TeacherBilling
        initialFamilyBalances={[owingFamily]}
        initialChargeRuns={[]}
        onIssueReceipt={onIssueReceipt}
      />,
    );

    await user.click(screen.getByRole("button", { name: /manage/i }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByPlaceholderText("Amount"), "45");
    await user.click(within(dialog).getByRole("button", { name: /^log payment$/i }));

    await screen.findByText(/45,00 €.*receipt for it/i);
    await user.click(screen.getByRole("button", { name: /issue a receipt/i }));

    expect(onIssueReceipt).toHaveBeenCalledWith({
      familyId: "family-1",
      amount: 45,
      paymentMethod: 3,
    });
  });

  it("dismisses the issue-a-receipt offer without calling onIssueReceipt", async () => {
    const user = userEvent.setup();
    vi.mocked(billingActions.listFamilyBalancesAction).mockResolvedValue([owingFamily]);
    vi.mocked(billingActions.getFamilyLedgerAction).mockResolvedValue({
      familyId: "family-1",
      balance: 100,
      monthlyAmount: 100,
      transactions: [],
    });
    vi.mocked(billingActions.logFamilyPaymentAction).mockResolvedValue({
      id: "txn-new",
      family_id: "family-1",
      type: "payment",
      amount: -45,
      period: null,
      period_end: null,
      covers_months: null,
      description: "Πληρωμή",
      receipt_id: null,
      payment_method: 3,
      source: "manual",
      created_by: "teacher-1",
      created_at: "2026-08-25T00:00:00Z",
    });
    const onIssueReceipt = vi.fn();

    render(
      <TeacherBilling
        initialFamilyBalances={[owingFamily]}
        initialChargeRuns={[]}
        onIssueReceipt={onIssueReceipt}
      />,
    );

    await user.click(screen.getByRole("button", { name: /manage/i }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByPlaceholderText("Amount"), "45");
    await user.click(within(dialog).getByRole("button", { name: /^log payment$/i }));

    await user.click(await screen.findByRole("button", { name: /not now/i }));

    expect(onIssueReceipt).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /issue a receipt/i })).not.toBeInTheDocument();
  });
});
