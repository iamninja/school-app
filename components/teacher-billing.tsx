"use client";

import * as React from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { PlayIcon, Trash2Icon } from "lucide-react";

import {
  adjustFamilyBalanceAction,
  deleteFamilyBalanceTransactionAction,
  getFamilyLedgerAction,
  listChargeRunsAction,
  listFamilyBalancesAction,
  logFamilyPaymentAction,
  prepayFamilyMonthsAction,
  previewFamilyPrepaymentAction,
  runMonthlyChargesAction,
} from "@/app/protected/teacher/billing-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEuro } from "@/lib/format-currency";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { currentPeriod, isBillableMonth } from "@/lib/billing/school-year";
import {
  deriveTuitionStatus,
  TUITION_STATUS_LABELS_EN,
  type TuitionStatus,
} from "@/lib/billing/tuition-status";
import type {
  ChargeRun,
  FamilyBalanceSummary,
  FamilyBalanceTransaction,
  FamilyLedger,
  ReceiptPrefill,
} from "@/lib/types/database";

const TRANSACTION_TYPE_LABELS: Record<
  FamilyBalanceTransaction["type"],
  string
> = {
  monthly_charge: "Monthly charge",
  payment: "Payment",
  receipt: "Receipt",
  prepayment: "Prepayment",
  adjustment: "Adjustment",
};

const STATUS_BADGE_VARIANT: Record<
  TuitionStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  scholarship: "outline",
  credit: "secondary",
  clear: "outline",
  due: "default",
  past_due: "destructive",
};

// Business-wide default (school_year_start_month/duration_months on
// business_profile). No prop threading it through yet - the run banner
// and prepay preview both re-derive the true answer from the server
// (previewFamilyPrepaymentAction, runMonthlyChargesAction), this is only
// used for the client-side "is this month even worth showing a button
// for" hint, which degrades gracefully to the same default if a business
// ever changes it.
const DEFAULT_SCHOOL_YEAR = { startMonth: 9, durationMonths: 9 };

function balanceClassName(balance: number): string {
  if (balance > 0) return "text-destructive font-medium";
  if (balance < 0) return "text-emerald-600 dark:text-emerald-400 font-medium";
  return "text-muted-foreground";
}

export function TeacherBilling({
  initialFamilyBalances,
  initialChargeRuns,
  onIssueReceipt,
}: {
  initialFamilyBalances: FamilyBalanceSummary[];
  initialChargeRuns: ChargeRun[];
  // Hands off to the Receipts tab (switches section + pre-fills the
  // create-receipt form) - optional, since a receipt is never required
  // for an informal payment.
  onIssueReceipt: (prefill: ReceiptPrefill) => void;
}) {
  const [families, setFamilies] = React.useState(initialFamilyBalances);
  const [chargeRuns, setChargeRuns] = React.useState(initialChargeRuns);
  const [showZeroBalances, setShowZeroBalances] = React.useState(true);
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeFamilyId, setActiveFamilyId] = React.useState<string | null>(
    null,
  );

  const period = currentPeriod();
  const month = Number(period.split("-")[1]);
  const billable = isBillableMonth(month, DEFAULT_SCHOOL_YEAR);
  const latestRun = chargeRuns[0];
  const alreadyPostedThisPeriod =
    latestRun?.period === period && latestRun.families_charged > 0;

  const refreshLists = async () => {
    try {
      const [nextFamilies, nextRuns] = await Promise.all([
        listFamilyBalancesAction(),
        listChargeRunsAction(),
      ]);
      setFamilies(nextFamilies);
      setChargeRuns(nextRuns);
    } catch {
      // Local state already reflects the action that just ran; a failed
      // background refresh isn't worth surfacing as its own error.
    }
  };

  const handleRunCharges = async () => {
    setIsRunning(true);
    try {
      const result = await runMonthlyChargesAction({});
      if (result.familiesCharged > 0) {
        toast.success(
          `Posted charges for ${result.familiesCharged} ${result.familiesCharged === 1 ? "family" : "families"} (${formatEuro(result.totalAmount)})`,
        );
      } else if (result.skippedReason === "not_a_billable_month") {
        toast.info("This month is outside the school year — nothing to charge.");
      } else {
        toast.info("Already up to date — nothing new to charge.");
      }
      await refreshLists();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to run charges",
      );
    } finally {
      setIsRunning(false);
    }
  };

  const visibleFamilies = showZeroBalances
    ? families
    : families.filter((family) => family.balance !== 0);
  const sortedFamilies = [...visibleFamilies].sort(
    (a, b) => b.balance - a.balance,
  );

  const activeFamily = families.find((family) => family.id === activeFamilyId);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Monthly charges</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!billable ? (
            <p className="text-sm text-muted-foreground">
              This month is outside the school year (September–May by
              default) — no tuition accrues right now.
            </p>
          ) : alreadyPostedThisPeriod ? (
            <p className="text-sm text-muted-foreground">
              Charges for this period were posted for {latestRun.families_charged}{" "}
              {latestRun.families_charged === 1 ? "family" : "families"} (
              {formatEuro(latestRun.total_amount)} total) on{" "}
              {format(new Date(latestRun.ran_at), "d MMM, HH:mm")} via{" "}
              {latestRun.source}. Running again is safe and won&apos;t
              double-charge anyone.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              This month&apos;s charges haven&apos;t posted yet.
            </p>
          )}
          <Button
            type="button"
            onClick={() => void handleRunCharges()}
            disabled={isRunning || !billable}
            title={
              !billable
                ? "This month is outside the school year"
                : undefined
            }
          >
            <PlayIcon className="mr-1 h-3.5 w-3.5" />
            {isRunning ? "Running…" : "Apply this month's charges"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Family balances</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowZeroBalances((prev) => !prev)}
          >
            {showZeroBalances ? "Hide" : "Show"} zero balances
          </Button>
        </CardHeader>
        <CardContent>
          {sortedFamilies.length === 0 ? (
            <p className="text-sm text-muted-foreground">No families to show.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Family</TableHead>
                    <TableHead>Students</TableHead>
                    <TableHead className="text-right">Monthly</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedFamilies.map((family) => {
                    const status = deriveTuitionStatus({
                      balance: family.balance,
                      monthlyAmount: family.monthlyAmount,
                    });
                    return (
                      <TableRow key={family.id}>
                        <TableCell>
                          {family.parentNames.join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {family.studentNames.join(", ") || "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatEuro(family.monthlyAmount)}
                        </TableCell>
                        <TableCell
                          className={`text-right ${balanceClassName(family.balance)}`}
                        >
                          {formatEuro(family.balance)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGE_VARIANT[status]}>
                            {TUITION_STATUS_LABELS_EN[status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setActiveFamilyId(family.id)}
                          >
                            Manage
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {chargeRuns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Charge run history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Period</TableHead>
                    <TableHead>Ran at</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead className="text-right">Families</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chargeRuns.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell>{run.period.slice(0, 7)}</TableCell>
                      <TableCell>
                        {format(new Date(run.ran_at), "d MMM, HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{run.source}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {run.families_charged}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatEuro(run.total_amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog
        open={activeFamilyId !== null}
        onOpenChange={(open) => {
          if (!open) setActiveFamilyId(null);
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {activeFamily && (
            <FamilyBillingDetail
              family={activeFamily}
              onChanged={refreshLists}
              onIssueReceipt={(prefill) => {
                // Leaving the Billing tab entirely, so close this dialog
                // rather than leave it open behind the Receipts view.
                setActiveFamilyId(null);
                onIssueReceipt(prefill);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FamilyBillingDetail({
  family,
  onChanged,
  onIssueReceipt,
}: {
  family: FamilyBalanceSummary;
  onChanged: () => Promise<void>;
  onIssueReceipt: (prefill: ReceiptPrefill) => void;
}) {
  const [ledger, setLedger] = React.useState<FamilyLedger | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<string>("3");
  const [paymentNotes, setPaymentNotes] = React.useState("");
  const [isSubmittingPayment, setIsSubmittingPayment] = React.useState(false);
  // Set right after a payment is logged, so the "Issue a receipt for
  // this" offer only appears immediately after, not on every render -
  // clears itself once the teacher starts a new payment.
  const [justLoggedPayment, setJustLoggedPayment] = React.useState<{
    amount: number;
    paymentMethod: number;
  } | null>(null);

  const [prepayMonths, setPrepayMonths] = React.useState("3");
  const [prepayPreview, setPrepayPreview] = React.useState<{
    periods: string[];
    total: number;
  } | null>(null);
  const [isPreviewing, setIsPreviewing] = React.useState(false);
  const [isPrepaying, setIsPrepaying] = React.useState(false);

  const [showAdjustment, setShowAdjustment] = React.useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = React.useState("");
  const [adjustmentKind, setAdjustmentKind] = React.useState<"charge" | "credit">(
    "credit",
  );
  const [adjustmentDescription, setAdjustmentDescription] = React.useState("");
  const [isAdjusting, setIsAdjusting] = React.useState(false);

  const loadLedger = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getFamilyLedgerAction(family.id);
      setLedger(data);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load ledger",
      );
    } finally {
      setIsLoading(false);
    }
  }, [family.id]);

  React.useEffect(() => {
    // Fetching this family's ledger when the dialog opens for them is a
    // real "synchronize with an external system" effect, not derived
    // state - same exception category already established in this
    // codebase for quiz-timer's countdown reset.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadLedger();
  }, [loadLedger]);

  const handlePreview = async () => {
    const months = Number(prepayMonths);
    if (!Number.isInteger(months) || months < 1) return;
    setIsPreviewing(true);
    try {
      const preview = await previewFamilyPrepaymentAction({
        familyId: family.id,
        months,
      });
      setPrepayPreview({ periods: preview.periods, total: preview.total });
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to preview prepayment",
      );
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleLogPayment = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number.parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    setIsSubmittingPayment(true);
    try {
      await logFamilyPaymentAction({
        familyId: family.id,
        amount,
        paymentMethod: Number(paymentMethod),
        notes: paymentNotes.trim() || undefined,
      });
      toast.success("Payment logged");
      setJustLoggedPayment({ amount, paymentMethod: Number(paymentMethod) });
      setPaymentAmount("");
      setPaymentNotes("");
      await loadLedger();
      await onChanged();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to log payment",
      );
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handlePrepay = async () => {
    const months = Number(prepayMonths);
    if (!Number.isInteger(months) || months < 1) {
      toast.error("Months must be a whole number, at least 1");
      return;
    }
    setIsPrepaying(true);
    try {
      await prepayFamilyMonthsAction({
        familyId: family.id,
        months,
        paymentMethod: Number(paymentMethod),
      });
      toast.success(`Prepayment recorded for ${months} months`);
      setPrepayPreview(null);
      await loadLedger();
      await onChanged();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to record prepayment",
      );
    } finally {
      setIsPrepaying(false);
    }
  };

  const handleAdjust = async (event: React.FormEvent) => {
    event.preventDefault();
    const magnitude = Number.parseFloat(adjustmentAmount);
    if (!Number.isFinite(magnitude) || magnitude <= 0) {
      toast.error("Amount must be greater than zero");
      return;
    }
    if (!adjustmentDescription.trim()) {
      toast.error("Say what this adjustment is for");
      return;
    }
    setIsAdjusting(true);
    try {
      await adjustFamilyBalanceAction({
        familyId: family.id,
        amount: adjustmentKind === "credit" ? -magnitude : magnitude,
        description: adjustmentDescription.trim(),
      });
      toast.success("Adjustment recorded");
      setAdjustmentAmount("");
      setAdjustmentDescription("");
      setShowAdjustment(false);
      await loadLedger();
      await onChanged();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to record adjustment",
      );
    } finally {
      setIsAdjusting(false);
    }
  };

  const handleDeleteTransaction = async (transaction: FamilyBalanceTransaction) => {
    if (!window.confirm(`Delete this ${TRANSACTION_TYPE_LABELS[transaction.type]} entry?`)) {
      return;
    }
    try {
      await deleteFamilyBalanceTransactionAction(transaction.id);
      toast.success("Entry deleted");
      await loadLedger();
      await onChanged();
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete entry",
      );
    }
  };

  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle>{family.parentNames.join(", ") || "Family"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-1">
        <p className={`text-2xl ${balanceClassName(family.balance)}`}>
          {formatEuro(family.balance)}
        </p>
        <p className="text-sm text-muted-foreground">
          Monthly:{" "}
          {family.studentNames.length > 0
            ? family.studentNames.join(", ")
            : "no active students"}{" "}
          — {formatEuro(family.monthlyAmount)}/month
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <form onSubmit={handleLogPayment} className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Log a payment</p>
          <p className="text-xs text-muted-foreground">
            Records the money, not a tax document.
          </p>
          <Input
            type="number"
            min={0}
            step="0.01"
            placeholder="Amount"
            value={paymentAmount}
            onChange={(event) => {
              setPaymentAmount(event.target.value);
              setJustLoggedPayment(null);
            }}
          />
          <select
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {PAYMENT_METHODS.map((method) => (
              <option key={method.code} value={method.code}>
                {method.label}
              </option>
            ))}
          </select>
          <Input
            placeholder="Note (optional)"
            value={paymentNotes}
            onChange={(event) => setPaymentNotes(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={isSubmittingPayment}>
            {isSubmittingPayment ? "Saving…" : "Log payment"}
          </Button>
          {justLoggedPayment && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-muted p-2 text-xs">
              <span>
                {formatEuro(justLoggedPayment.amount)} logged. Want a real
                receipt for it?
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onIssueReceipt({
                      familyId: family.id,
                      amount: justLoggedPayment.amount,
                      paymentMethod: justLoggedPayment.paymentMethod,
                    })
                  }
                >
                  Issue a receipt
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setJustLoggedPayment(null)}
                >
                  Not now
                </Button>
              </div>
            </div>
          )}
        </form>

        <div className="space-y-2 rounded-md border p-3">
          <p className="text-sm font-medium">Prepay months</p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={12}
              value={prepayMonths}
              onChange={(event) => {
                setPrepayMonths(event.target.value);
                setPrepayPreview(null);
              }}
              className="w-20"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handlePreview()}
              disabled={isPreviewing}
            >
              Preview
            </Button>
          </div>
          {prepayPreview && (
            <p className="text-xs text-muted-foreground">
              Covers {prepayPreview.periods.map((p) => p.slice(0, 7)).join(", ")}
              {" — "}
              {formatEuro(prepayPreview.total)}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            onClick={() => void handlePrepay()}
            disabled={isPrepaying}
          >
            {isPrepaying ? "Saving…" : "Prepay"}
          </Button>
        </div>
      </div>

      <div>
        {!showAdjustment ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdjustment(true)}
          >
            Add a correction
          </Button>
        ) : (
          <form
            onSubmit={handleAdjust}
            className="space-y-2 rounded-md border p-3"
          >
            <p className="text-sm font-medium">Correction</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={adjustmentKind === "credit" ? "default" : "outline"}
                onClick={() => setAdjustmentKind("credit")}
              >
                Credit
              </Button>
              <Button
                type="button"
                size="sm"
                variant={adjustmentKind === "charge" ? "default" : "outline"}
                onClick={() => setAdjustmentKind("charge")}
              >
                Charge
              </Button>
            </div>
            <Input
              type="number"
              min={0}
              step="0.01"
              placeholder="Amount"
              value={adjustmentAmount}
              onChange={(event) => setAdjustmentAmount(event.target.value)}
            />
            <Input
              placeholder="What's this for?"
              value={adjustmentDescription}
              onChange={(event) => setAdjustmentDescription(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={isAdjusting}>
              {isAdjusting ? "Saving…" : "Save correction"}
            </Button>
          </form>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">History</p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !ledger || ledger.transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {ledger.transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <div>
                  <p className="font-medium">{transaction.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(transaction.created_at), "d MMM yyyy")}
                    {" · "}
                    {TRANSACTION_TYPE_LABELS[transaction.type]}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={balanceClassName(transaction.amount)}>
                    {formatEuro(transaction.amount)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={transaction.type === "receipt"}
                    title={
                      transaction.type === "receipt"
                        ? "Delete the receipt instead"
                        : undefined
                    }
                    onClick={() => void handleDeleteTransaction(transaction)}
                  >
                    <Trash2Icon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
