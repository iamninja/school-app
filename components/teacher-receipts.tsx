"use client";

import { getErrorMessage } from "@/lib/expected-error";
import * as React from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  EyeIcon,
  PlusIcon,
  PrinterIcon,
  SendIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import {
  createReceiptAction,
  deleteReceiptAction,
  previewReceiptCoverageAction,
  submitReceiptToMyDataAction,
  verifyReceiptWithMyDataAction,
} from "@/app/protected/teacher/receipt-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ReceiptDocument } from "@/components/receipt-document";
import { formatEuro } from "@/lib/format-currency";
import { formatPeriodLabel } from "@/lib/billing/school-year";
import {
  CASH_LIMIT_MESSAGE,
  CASH_PAYMENT_CODE,
  CASH_PAYMENT_LIMIT,
  PAYMENT_METHODS,
  isCashAllowed,
} from "@/lib/payment-methods";
import type {
  BusinessProfile,
  Receipt,
  ReceiptCoveragePreview,
  ReceiptPrefill,
} from "@/lib/types/database";

type FamilyOption = {
  id: string;
  parentNames: string[];
  studentNames: string[];
};

type LineDraft = { description: string; amount: string };

function blankLine(): LineDraft {
  return { description: "", amount: "" };
}

const formatAmount = formatEuro;

export function TeacherReceipts({
  initialReceipts,
  families,
  business,
  prefill = null,
  onPrefillConsumed,
}: {
  initialReceipts: Receipt[];
  families: FamilyOption[];
  business: BusinessProfile | null;
  // Set (as a fresh object) when the Billing tab's "Issue a receipt for
  // this" hands off a just-logged payment - opens the create dialog
  // pre-filled instead of the teacher re-entering the same details.
  prefill?: ReceiptPrefill | null;
  onPrefillConsumed?: () => void;
}) {
  const [receipts, setReceipts] = React.useState(initialReceipts);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [viewing, setViewing] = React.useState<Receipt | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);
  const [verifyingId, setVerifyingId] = React.useState<string | null>(null);

  const [familyId, setFamilyId] = React.useState("");
  const [recipientName, setRecipientName] = React.useState("");
  const [recipientAfm, setRecipientAfm] = React.useState("");
  const [recipientAddress, setRecipientAddress] = React.useState("");
  const [issueDate, setIssueDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<number>(3);
  const [countsTowardBalance, setCountsTowardBalance] = React.useState(true);
  const [lines, setLines] = React.useState<LineDraft[]>([blankLine()]);

  // Multi-month receipt: a range of covered months at an agreed price. The
  // month inputs hold "YYYY-MM"; the server wants first-of-month dates.
  const [coversEnabled, setCoversEnabled] = React.useState(false);
  const [coversStart, setCoversStart] = React.useState("");
  const [coversEnd, setCoversEnd] = React.useState("");
  const [agreedAmount, setAgreedAmount] = React.useState("");
  const [coveragePreview, setCoveragePreview] =
    React.useState<ReceiptCoveragePreview | null>(null);
  const [coverageError, setCoverageError] = React.useState<string | null>(null);
  const previewRequestId = React.useRef(0);

  // The row-level Print button opens the receipt and then prints it. A ref,
  // not state: the flag is only read by the effect below, and the print
  // itself is the side effect. It is cleared inside the timer callback (not
  // before it) so React strict mode's dev double-run of the effect still
  // prints exactly once.
  const printOnOpen = React.useRef(false);
  React.useEffect(() => {
    if (!viewing || !printOnOpen.current) return;
    // A short delay so the receipt (and its logo image) has rendered before
    // the browser snapshots the page for the print preview.
    const timer = window.setTimeout(() => {
      printOnOpen.current = false;
      window.print();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [viewing]);

  const handlePrintReceipt = (receipt: Receipt) => {
    printOnOpen.current = true;
    setViewing(receipt);
  };

  const businessReady = Boolean(business?.business_name && business?.afm);

  const total = lines.reduce((sum, line) => {
    const value = Number.parseFloat(line.amount);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  // Cash above the legal limit: the option is disabled, and if cash was
  // already picked we show the error and block submit rather than silently
  // switching what the teacher says actually happened.
  const cashBlocked =
    paymentMethod === CASH_PAYMENT_CODE && !isCashAllowed(total);

  // Soft warning only: several cash receipts to one family on one day can
  // add up to one over-the-limit payment. Splitting doesn't make it legal.
  const sameDayCashTotal =
    paymentMethod === CASH_PAYMENT_CODE && familyId
      ? receipts
          .filter(
            (receipt) =>
              receipt.family_id === familyId &&
              receipt.issue_date === issueDate &&
              receipt.payment_method === CASH_PAYMENT_CODE,
          )
          .reduce((sum, receipt) => sum + receipt.total_amount, 0) + total
      : 0;
  const sameDayCashWarning =
    !cashBlocked && sameDayCashTotal > CASH_PAYMENT_LIMIT;

  const agreedValue = Number.parseFloat(agreedAmount);
  const hasAgreed = Number.isFinite(agreedValue) && agreedValue > 0;
  const discount =
    coveragePreview && hasAgreed
      ? Math.max(0, coveragePreview.grossTotal - agreedValue)
      : 0;
  const balanceAfter = coveragePreview
    ? coveragePreview.balance +
      coveragePreview.newChargesTotal -
      discount -
      (countsTowardBalance ? total : 0)
    : null;

  const loadCoveragePreview = async (
    nextFamilyId: string,
    start: string,
    end: string,
  ) => {
    const requestId = ++previewRequestId.current;
    if (!nextFamilyId || !start || !end) {
      setCoveragePreview(null);
      setCoverageError(null);
      return;
    }
    try {
      const preview = await previewReceiptCoverageAction({
        familyId: nextFamilyId,
        start: `${start}-01`,
        end: `${end}-01`,
      });
      if (requestId !== previewRequestId.current) return;
      setCoveragePreview(preview);
      setCoverageError(null);
      setLines((prev) =>
        prev.length === 1 && !prev[0].description
          ? [
              {
                ...prev[0],
                description: `Δίδακτρα ${formatPeriodLabel(`${start}-01`)} – ${formatPeriodLabel(`${end}-01`)}`,
              },
            ]
          : prev,
      );
    } catch (error: unknown) {
      if (requestId !== previewRequestId.current) return;
      setCoveragePreview(null);
      setCoverageError(
        getErrorMessage(error, "Could not preview these months"),
      );
    }
  };

  const resetForm = () => {
    setFamilyId("");
    setRecipientName("");
    setRecipientAfm("");
    setRecipientAddress("");
    setIssueDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setPaymentMethod(3);
    setCountsTowardBalance(true);
    setLines([blankLine()]);
    setCoversEnabled(false);
    setCoversStart("");
    setCoversEnd("");
    setAgreedAmount("");
    setCoveragePreview(null);
    setCoverageError(null);
  };

  // Picking a family is a convenience prefill only - the name stays freely
  // editable, and a receipt can be issued to someone with no family record.
  const handleSelectFamily = (nextFamilyId: string) => {
    setFamilyId(nextFamilyId);
    const family = families.find((item) => item.id === nextFamilyId);
    if (family && family.parentNames.length > 0) {
      setRecipientName(family.parentNames[0]);
    }
    if (!nextFamilyId) {
      // Coverage needs a family; there is nothing to cover without one.
      setCoversEnabled(false);
      setCoveragePreview(null);
      setCoverageError(null);
    } else if (coversEnabled) {
      void loadCoveragePreview(nextFamilyId, coversStart, coversEnd);
    }
  };

  React.useEffect(() => {
    if (!prefill) return;
    // Reacting to a hand-off from the Billing tab ("Issue a receipt for
    // this") is a real "synchronize with an external system" effect, not
    // derived state - same exception category as FamilyBillingDetail's
    // ledger-fetch effect in teacher-billing.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    handleSelectFamily(prefill.familyId);
    setPaymentMethod(prefill.paymentMethod);
    setLines([{ description: "Πληρωμή", amount: String(prefill.amount) }]);
    setIsCreateOpen(true);
    onPrefillConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (cashBlocked) {
      toast.error(CASH_LIMIT_MESSAGE);
      return;
    }
    const covering = coversEnabled && familyId && coversStart && coversEnd;
    if (coversEnabled && !covering) {
      toast.error("Choose the first and last covered month");
      return;
    }
    setIsSubmitting(true);
    try {
      // The discount can't be a negative line (amounts must be >= 0 and
      // myDATA takes the amount actually collected), so it is stated in the
      // notes of the printed receipt instead.
      const coverageNote =
        covering && coveragePreview && hasAgreed && discount > 0
          ? `Συμφωνημένη τιμή ${formatAmount(agreedValue)} αντί ${formatAmount(coveragePreview.grossTotal)} (έκπτωση ${formatAmount(discount)})`
          : "";
      const created = await createReceiptAction({
        issueDate,
        recipientName,
        recipientAfm,
        recipientAddress,
        familyId: familyId || null,
        notes: [notes.trim(), coverageNote].filter(Boolean).join(" — "),
        paymentMethod,
        countsTowardBalance,
        coversPeriodStart: covering ? `${coversStart}-01` : null,
        coversPeriodEnd: covering ? `${coversEnd}-01` : null,
        agreedAmount: covering && hasAgreed ? agreedValue : null,
        lineItems: lines.map((line) => ({
          description: line.description,
          amount: Number.parseFloat(line.amount),
        })),
      });
      setReceipts((prev) => [created, ...prev]);
      resetForm();
      setIsCreateOpen(false);
      setViewing(created);
      toast.success(
        `Receipt ${created.series}-${created.receipt_number} issued`,
      );
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Failed to issue receipt"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitToMyData = async (receipt: Receipt) => {
    setSubmittingId(receipt.id);
    try {
      const updated = await submitReceiptToMyDataAction(receipt.id);
      setReceipts((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (viewing?.id === updated.id) {
        setViewing(updated);
      }
      toast.success(`Sent to myDATA — MARK ${updated.mydata_mark}`);
    } catch (error: unknown) {
      // The receipt is still saved and still retryable; only the
      // transmission failed, so this is a message rather than a crash.
      toast.error(
        getErrorMessage(error, "Failed to send to myDATA"),
      );
      setReceipts((prev) =>
        prev.map((item) =>
          item.id === receipt.id
            ? { ...item, mydata_status: "failed" as const }
            : item,
        ),
      );
    } finally {
      setSubmittingId(null);
    }
  };

  const handleVerify = async (receipt: Receipt) => {
    setVerifyingId(receipt.id);
    try {
      const updated = await verifyReceiptWithMyDataAction(receipt.id);
      setReceipts((prev) =>
        prev.map((item) => (item.id === updated.id ? updated : item)),
      );
      if (viewing?.id === updated.id) {
        setViewing(updated);
      }
      toast.success(`Confirmed on AADE — MARK ${updated.mydata_mark}`);
    } catch (error: unknown) {
      // A "not found" result still updates mydata_last_verified_* on the
      // receipt (via the action), so the message here is the detail, not
      // the whole story - the badge reflects the real outcome either way.
      toast.error(
        getErrorMessage(error, "Could not verify with AADE"),
      );
      setReceipts((prev) =>
        prev.map((item) =>
          item.id === receipt.id
            ? {
                ...item,
                mydata_last_verified_at: new Date().toISOString(),
                mydata_last_verified_ok: false,
              }
            : item,
        ),
      );
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (receipt: Receipt) => {
    if (
      !window.confirm(
        `Delete receipt ${receipt.series}-${receipt.receipt_number}? The number won't be reused, so the sequence will show a gap.`,
      )
    ) {
      return;
    }
    setDeletingId(receipt.id);
    try {
      await deleteReceiptAction(receipt.id);
      setReceipts((prev) => prev.filter((item) => item.id !== receipt.id));
      if (viewing?.id === receipt.id) {
        setViewing(null);
      }
      toast.success("Receipt deleted");
    } catch (error: unknown) {
      toast.error(
        getErrorMessage(error, "Failed to delete receipt"),
      );
    } finally {
      setDeletingId(null);
    }
  };

  if (viewing) {
    return (
      <div className="space-y-4">
        {/* print:hidden so the toolbar doesn't end up on the paper. */}
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" onClick={() => setViewing(null)}>
            <XIcon className="mr-1 h-3.5 w-3.5" /> Back to receipts
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <PrinterIcon className="mr-1 h-3.5 w-3.5" /> Print / Save as PDF
          </Button>
        </div>
        <ReceiptDocument receipt={viewing} business={business} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Receipts</CardTitle>
          <Button
            type="button"
            size="sm"
            disabled={!businessReady}
            onClick={() => setIsCreateOpen(true)}
          >
            <PlusIcon className="mr-1 h-3.5 w-3.5" /> New receipt
          </Button>
        </CardHeader>
        <CardContent>
          {!businessReady && (
            <p className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Add your business name and ΑΦΜ in the <strong>Business</strong>{" "}
              tab first — they have to appear on every receipt.
            </p>
          )}

          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No receipts issued yet.
            </p>
          ) : (
            <div className="space-y-2">
              {receipts.map((receipt) => (
                <div
                  key={receipt.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <button
                    type="button"
                    onClick={() => setViewing(receipt)}
                    className="flex-1 text-left"
                  >
                    <p className="text-sm font-medium">
                      {receipt.series}-{receipt.receipt_number} ·{" "}
                      {receipt.recipient_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(receipt.issue_date), "d MMM yyyy")} ·{" "}
                      {formatAmount(receipt.total_amount)}
                    </p>
                  </button>
                  <div className="flex items-center gap-2">
                    {!receipt.counts_toward_balance && (
                      <Badge variant="outline">Not counted toward balance</Badge>
                    )}
                    {receipt.mydata_status === "submitted" ? (
                      <Badge
                        title={`MARK ${receipt.mydata_mark ?? ""}`}
                        variant={
                          receipt.mydata_last_verified_ok === false
                            ? "destructive"
                            : "default"
                        }
                      >
                        {receipt.mydata_last_verified_ok === false
                          ? "myDATA sent — not confirmed"
                          : receipt.mydata_last_verified_ok === true
                            ? "myDATA verified"
                            : "myDATA sent"}
                        {receipt.mydata_environment === "sandbox"
                          ? " (sandbox)"
                          : ""}
                      </Badge>
                    ) : receipt.mydata_status === "failed" ? (
                      <Badge variant="destructive">myDATA failed</Badge>
                    ) : (
                      <Badge variant="outline">Not sent to myDATA</Badge>
                    )}
                    {receipt.mydata_warning && (
                      <Badge variant="destructive" title={receipt.mydata_warning}>
                        myDATA warning
                      </Badge>
                    )}
                    {/* A sandbox MARK has no legal standing with AADE, so a
                        receipt that's only ever been sandbox-submitted still
                        needs a real path to production - only a production
                        MARK should hide this button. */}
                    {!(
                      receipt.mydata_status === "submitted" &&
                      receipt.mydata_environment === "production"
                    ) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={submittingId === receipt.id}
                        onClick={() => void handleSubmitToMyData(receipt)}
                      >
                        <SendIcon className="mr-1 h-3.5 w-3.5" />
                        {submittingId === receipt.id
                          ? "Sending..."
                          : receipt.mydata_status === "failed"
                            ? "Retry myDATA"
                            : receipt.mydata_status === "submitted"
                              ? "Send to production"
                              : "Send to myDATA"}
                      </Button>
                    )}
                    {receipt.mydata_status === "submitted" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={verifyingId === receipt.id}
                        title={
                          receipt.mydata_last_verified_at
                            ? `Last checked ${new Date(receipt.mydata_last_verified_at).toLocaleString()}`
                            : "Never checked"
                        }
                        onClick={() => void handleVerify(receipt)}
                      >
                        <ShieldCheckIcon className="mr-1 h-3.5 w-3.5" />
                        {verifyingId === receipt.id
                          ? "Checking..."
                          : "Verify with AADE"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setViewing(receipt)}
                    >
                      <EyeIcon className="mr-1 h-3.5 w-3.5" /> View
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Print receipt ${receipt.series}-${receipt.receipt_number}`}
                      onClick={() => handlePrintReceipt(receipt)}
                    >
                      <PrinterIcon className="mr-1 h-3.5 w-3.5" /> Print
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={deletingId === receipt.id}
                      aria-label={`Delete receipt ${receipt.series}-${receipt.receipt_number}`}
                      onClick={() => void handleDelete(receipt)}
                    >
                      <Trash2Icon className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isCreateOpen}
        onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New receipt</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            {families.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="receipt-family">
                  Prefill from a family (optional)
                </Label>
                <select
                  id="receipt-family"
                  value={familyId}
                  onChange={(event) => handleSelectFamily(event.target.value)}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Not linked to a family</option>
                  {families.map((family) => (
                    <option key={family.id} value={family.id}>
                      {family.parentNames.join(", ") || "(no parent name)"}
                      {family.studentNames.length > 0
                        ? ` — ${family.studentNames.join(", ")}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {familyId && (
              <div className="flex items-start gap-2 rounded-md border p-3">
                <Checkbox
                  id="receipt-counts-toward-balance"
                  checked={countsTowardBalance}
                  onCheckedChange={(checked) =>
                    setCountsTowardBalance(checked === true)
                  }
                />
                <div className="space-y-1">
                  <Label
                    htmlFor="receipt-counts-toward-balance"
                    className="font-normal"
                  >
                    Counts toward this family&apos;s balance
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Uncheck for enrollment fees, material fees, or money owed
                    before using Modus — the receipt still appears in their
                    history, it just won&apos;t reduce what they owe.
                  </p>
                </div>
              </div>
            )}

            {familyId && countsTowardBalance && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="receipt-covers-months"
                    checked={coversEnabled}
                    onCheckedChange={(checked) => {
                      const enabled = checked === true;
                      setCoversEnabled(enabled);
                      if (enabled) {
                        void loadCoveragePreview(
                          familyId,
                          coversStart,
                          coversEnd,
                        );
                      } else {
                        setCoveragePreview(null);
                        setCoverageError(null);
                      }
                    }}
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="receipt-covers-months"
                      className="font-normal"
                    >
                      This receipt covers multiple months
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Charges those months now at today&apos;s monthly amount,
                      so the monthly run skips them. Use the agreed price for
                      the whole range if it&apos;s discounted.
                    </p>
                  </div>
                </div>

                {coversEnabled && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="receipt-covers-start">From month</Label>
                        <Input
                          id="receipt-covers-start"
                          type="month"
                          value={coversStart}
                          onChange={(event) => {
                            setCoversStart(event.target.value);
                            void loadCoveragePreview(
                              familyId,
                              event.target.value,
                              coversEnd,
                            );
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="receipt-covers-end">To month</Label>
                        <Input
                          id="receipt-covers-end"
                          type="month"
                          value={coversEnd}
                          onChange={(event) => {
                            setCoversEnd(event.target.value);
                            void loadCoveragePreview(
                              familyId,
                              coversStart,
                              event.target.value,
                            );
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="receipt-agreed-amount">
                          Agreed price (total)
                        </Label>
                        <Input
                          id="receipt-agreed-amount"
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="Full price"
                          value={agreedAmount}
                          onChange={(event) =>
                            setAgreedAmount(event.target.value)
                          }
                        />
                      </div>
                    </div>

                    {coverageError && (
                      <p className="text-sm text-destructive">{coverageError}</p>
                    )}

                    {coveragePreview && (
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt>
                            Full price ({coveragePreview.periods.length} months
                            × {formatAmount(coveragePreview.monthlyAmount)})
                          </dt>
                          <dd>{formatAmount(coveragePreview.grossTotal)}</dd>
                        </div>
                        {hasAgreed && (
                          <div className="flex justify-between">
                            <dt>Agreed price</dt>
                            <dd>{formatAmount(agreedValue)}</dd>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <dt>Discount</dt>
                          <dd>{formatAmount(discount)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt>This receipt</dt>
                          <dd>{formatAmount(total)}</dd>
                        </div>
                        <div className="flex justify-between font-medium">
                          <dt>Balance after</dt>
                          <dd>{formatAmount(balanceAfter ?? 0)}</dd>
                        </div>
                        <p className="pt-1 text-xs text-muted-foreground">
                          Amount is fixed at today&apos;s monthly total. A
                          student added later isn&apos;t covered for these
                          months. If you only receive part of the agreed price
                          now, the rest stays owed and later receipts pay it
                          off.
                        </p>
                      </dl>
                    )}
                  </>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="receipt-recipient">Issued to</Label>
              <Input
                id="receipt-recipient"
                value={recipientName}
                onChange={(event) => setRecipientName(event.target.value)}
                placeholder="Full name"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="receipt-afm">ΑΦΜ (optional)</Label>
                <Input
                  id="receipt-afm"
                  value={recipientAfm}
                  onChange={(event) => setRecipientAfm(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="receipt-date">Issue date</Label>
                <Input
                  id="receipt-date"
                  type="date"
                  value={issueDate}
                  onChange={(event) => setIssueDate(event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt-payment-method">Paid by</Label>
              <select
                id="receipt-payment-method"
                value={paymentMethod}
                onChange={(event) =>
                  setPaymentMethod(Number(event.target.value))
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option
                    key={method.code}
                    value={method.code}
                    disabled={
                      method.code === CASH_PAYMENT_CODE &&
                      !isCashAllowed(total) &&
                      paymentMethod !== CASH_PAYMENT_CODE
                    }
                  >
                    {method.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Required by myDATA — how the payment was actually made is
                part of the record sent to AADE. Cash is only allowed up to{" "}
                {formatAmount(CASH_PAYMENT_LIMIT)}.
              </p>
              {cashBlocked && (
                <p role="alert" className="text-sm font-medium text-destructive">
                  {CASH_LIMIT_MESSAGE}
                </p>
              )}
              {sameDayCashWarning && (
                <p className="text-sm text-amber-600">
                  Cash receipts to this family today already add up to{" "}
                  {formatAmount(sameDayCashTotal)}, above the{" "}
                  {formatAmount(CASH_PAYMENT_LIMIT)} cash limit for one
                  payment. Splitting a single payment across receipts
                  doesn&apos;t make it legal.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt-address">Address (optional)</Label>
              <Input
                id="receipt-address"
                value={recipientAddress}
                onChange={(event) => setRecipientAddress(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Lines</Label>
              {lines.map((line, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={line.description}
                    aria-label={`Line ${index + 1} description`}
                    placeholder="Δίδακτρα Σεπτεμβρίου"
                    onChange={(event) =>
                      setLines((prev) =>
                        prev.map((item, i) =>
                          i === index
                            ? { ...item, description: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="w-32"
                    aria-label={`Line ${index + 1} amount`}
                    placeholder="0.00"
                    value={line.amount}
                    onChange={(event) =>
                      setLines((prev) =>
                        prev.map((item, i) =>
                          i === index
                            ? { ...item, amount: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  {lines.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      aria-label={`Remove line ${index + 1}`}
                      onClick={() =>
                        setLines((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      <XIcon className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLines((prev) => [...prev, blankLine()])}
                >
                  <PlusIcon className="mr-1 h-3.5 w-3.5" /> Add line
                </Button>
                <p className="text-sm font-medium">
                  Total: {formatAmount(total)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="receipt-notes">Notes (optional)</Label>
              <Input
                id="receipt-notes"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Issued without VAT under Άρθρο 22 (tutoring exemption). The
              receipt number is assigned automatically and can&apos;t be
              changed afterwards.
            </p>

            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting || cashBlocked}
            >
              {isSubmitting ? "Issuing..." : "Issue receipt"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
