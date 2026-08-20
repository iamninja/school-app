"use client";

import * as React from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  PlusIcon,
  PrinterIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import {
  createReceiptAction,
  deleteReceiptAction,
  submitReceiptToMyDataAction,
} from "@/app/protected/teacher/receipt-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { BusinessProfile, Receipt } from "@/lib/types/database";

type FamilyOption = {
  id: string;
  parentNames: string[];
  studentNames: string[];
};

// AADE payment-method codes (spec §8.12), narrowed to the ones a tutoring
// centre realistically gets paid by rather than the full list.
const PAYMENT_METHODS = [
  { code: 3, label: "Μετρητά (cash)" },
  { code: 7, label: "POS / e-POS (card)" },
  { code: 6, label: "Web banking / transfer" },
  { code: 8, label: "IRIS" },
] as const;

type LineDraft = { description: string; amount: string };

function blankLine(): LineDraft {
  return { description: "", amount: "" };
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat("el-GR", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

export function TeacherReceipts({
  initialReceipts,
  families,
  business,
}: {
  initialReceipts: Receipt[];
  families: FamilyOption[];
  business: BusinessProfile | null;
}) {
  const [receipts, setReceipts] = React.useState(initialReceipts);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [viewing, setViewing] = React.useState<Receipt | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);

  const [familyId, setFamilyId] = React.useState("");
  const [recipientName, setRecipientName] = React.useState("");
  const [recipientAfm, setRecipientAfm] = React.useState("");
  const [recipientAddress, setRecipientAddress] = React.useState("");
  const [issueDate, setIssueDate] = React.useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState<number>(3);
  const [lines, setLines] = React.useState<LineDraft[]>([blankLine()]);

  const businessReady = Boolean(business?.business_name && business?.afm);

  const total = lines.reduce((sum, line) => {
    const value = Number.parseFloat(line.amount);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const resetForm = () => {
    setFamilyId("");
    setRecipientName("");
    setRecipientAfm("");
    setRecipientAddress("");
    setIssueDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setPaymentMethod(3);
    setLines([blankLine()]);
  };

  // Picking a family is a convenience prefill only - the name stays freely
  // editable, and a receipt can be issued to someone with no family record.
  const handleSelectFamily = (nextFamilyId: string) => {
    setFamilyId(nextFamilyId);
    const family = families.find((item) => item.id === nextFamilyId);
    if (family && family.parentNames.length > 0) {
      setRecipientName(family.parentNames[0]);
    }
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const created = await createReceiptAction({
        issueDate,
        recipientName,
        recipientAfm,
        recipientAddress,
        familyId: familyId || null,
        notes,
        paymentMethod,
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
        error instanceof Error ? error.message : "Failed to issue receipt",
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
        error instanceof Error ? error.message : "Failed to send to myDATA",
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
        error instanceof Error ? error.message : "Failed to delete receipt",
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
                    {receipt.mydata_status === "submitted" ? (
                      <Badge title={`MARK ${receipt.mydata_mark ?? ""}`}>
                        myDATA sent
                        {receipt.mydata_environment === "sandbox"
                          ? " (sandbox)"
                          : ""}
                      </Badge>
                    ) : receipt.mydata_status === "failed" ? (
                      <Badge variant="destructive">myDATA failed</Badge>
                    ) : (
                      <Badge variant="outline">Not sent to myDATA</Badge>
                    )}
                    {receipt.mydata_status !== "submitted" && (
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
                            : "Send to myDATA"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setViewing(receipt)}
                    >
                      <PrinterIcon className="mr-1 h-3.5 w-3.5" /> View
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
                  <option key={method.code} value={method.code}>
                    {method.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Required by myDATA — how the payment was actually made is
                part of the record sent to AADE.
              </p>
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

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Issuing..." : "Issue receipt"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
