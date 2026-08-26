"use client";

import * as React from "react";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";

import {
  createExpenseAction,
  deleteExpenseAction,
  updateExpenseAction,
} from "@/app/protected/teacher/expense-actions";
import { listMyDataDocumentsAction } from "@/app/protected/teacher/mydata-documents-actions";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatEuro } from "@/lib/format-currency";
import type { Expense, ExpenseInput } from "@/lib/types/database";
// Type-only - erased at compile time, so this never triggers the
// server-only guard in lib/mydata/client.ts at runtime in this client
// component.
import type { RequestedInvoice } from "@/lib/mydata/client";
import { describeInvoiceType } from "@/lib/mydata/invoice-types";

// AADE's own payment-method codes (spec §8.12) - a supplier's document can
// carry any of these, unlike our own receipts which narrow to the ones a
// tutoring centre realistically gets paid by (teacher-receipts.tsx).
const PAYMENT_METHOD_LABELS: Record<number, string> = {
  1: "Επιταγή",
  2: "Τραπεζικό έμβασμα",
  3: "Μετρητά",
  4: "Πιστωτική κάρτα (χωρίς POS)",
  5: "Χρεωστική κάρτα (χωρίς POS)",
  6: "Web Banking",
  7: "POS / e-POS",
  8: "IRIS",
};

function defaultMyDataDateRange() {
  const to = new Date();
  const from = subDays(to, 90);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to.toISOString().slice(0, 10),
  };
}

// AADE's own category2_x identifiers (spec §8.10), stored as the value so
// a future myDATA classification pass isn't starting from a blank field -
// same reasoning as receipts' vat_category. Ordered by relevance to a
// tutoring business, not by code.
const EXPENSE_CATEGORIES = [
  { code: "category2_3", label: "Λήψη Υπηρεσιών" },
  { code: "category2_4", label: "Γενικά Έξοδα (με έκπτωση ΦΠΑ)" },
  { code: "category2_5", label: "Γενικά Έξοδα (χωρίς έκπτωση ΦΠΑ)" },
  { code: "category2_6", label: "Αμοιβές και Παροχές προσωπικού" },
  { code: "category2_7", label: "Αγορές Παγίων" },
  { code: "category2_1", label: "Αγορές Εμπορευμάτων" },
  { code: "category2_2", label: "Αγορές Α'-Β' Υλών" },
  { code: "category2_8", label: "Αποσβέσεις Παγίων" },
  { code: "category2_9", label: "Έξοδα για λ/σμο τρίτων" },
  { code: "category2_10", label: "Έξοδα προηγούμενων χρήσεων" },
  { code: "category2_11", label: "Έξοδα επομένων χρήσεων" },
  { code: "category2_12", label: "Λοιπές Εγγραφές Τακτοποίησης Εξόδων" },
  { code: "category2_13", label: "Αποθέματα Έναρξης Περιόδου" },
  { code: "category2_14", label: "Αποθέματα Λήξης Περιόδου" },
  { code: "category2_95", label: "Λοιπά Πληροφοριακά Στοιχεία Εξόδων" },
] as const;

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  EXPENSE_CATEGORIES.map((c) => [c.code, c.label]),
);

const formatAmount = formatEuro;

type ExpenseForm = {
  expenseDate: string;
  supplierName: string;
  supplierAfm: string;
  description: string;
  amount: string;
  vatAmount: string;
  category: string;
  notes: string;
};

function blankForm(): ExpenseForm {
  return {
    expenseDate: new Date().toISOString().slice(0, 10),
    supplierName: "",
    supplierAfm: "",
    description: "",
    amount: "",
    vatAmount: "",
    category: "",
    notes: "",
  };
}

function formToInput(form: ExpenseForm): ExpenseInput {
  return {
    expenseDate: form.expenseDate,
    supplierName: form.supplierName,
    supplierAfm: form.supplierAfm,
    description: form.description,
    amount: Number.parseFloat(form.amount),
    vatAmount: form.vatAmount ? Number.parseFloat(form.vatAmount) : undefined,
    category: form.category || undefined,
    notes: form.notes,
  };
}

function expenseToForm(expense: Expense): ExpenseForm {
  return {
    expenseDate: expense.expense_date,
    supplierName: expense.supplier_name,
    supplierAfm: expense.supplier_afm ?? "",
    description: expense.description,
    amount: String(expense.amount),
    vatAmount: expense.vat_amount === null ? "" : String(expense.vat_amount),
    category: expense.category ?? "",
    notes: expense.notes ?? "",
  };
}

export function TeacherExpenses({
  initialExpenses,
}: {
  initialExpenses: Expense[];
}) {
  const [expenses, setExpenses] = React.useState(initialExpenses);
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<ExpenseForm>(blankForm());
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const [myDataRange, setMyDataRange] = React.useState(defaultMyDataDateRange);
  const [myDataDocuments, setMyDataDocuments] = React.useState<
    RequestedInvoice[]
  >([]);
  const [hasCheckedMyData, setHasCheckedMyData] = React.useState(false);
  const [isCheckingMyData, setIsCheckingMyData] = React.useState(false);

  const total = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const handleCheckMyData = async () => {
    setIsCheckingMyData(true);
    try {
      const documents = await listMyDataDocumentsAction(myDataRange);
      setMyDataDocuments(documents);
      setHasCheckedMyData(true);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to check myDATA",
      );
    } finally {
      setIsCheckingMyData(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(blankForm());
    setIsFormOpen(true);
  };

  const openEdit = (expense: Expense) => {
    setEditingId(expense.id);
    setForm(expenseToForm(expense));
    setIsFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const input = formToInput(form);
      if (editingId) {
        const updated = await updateExpenseAction(editingId, input);
        setExpenses((prev) =>
          prev.map((expense) =>
            expense.id === updated.id ? updated : expense,
          ),
        );
        toast.success("Expense updated");
      } else {
        const created = await createExpenseAction(input);
        setExpenses((prev) =>
          [created, ...prev].sort((a, b) =>
            b.expense_date.localeCompare(a.expense_date),
          ),
        );
        toast.success("Expense logged");
      }
      setIsFormOpen(false);
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save expense",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (expense: Expense) => {
    if (
      !window.confirm(
        `Delete this expense (${expense.supplier_name}, ${formatAmount(expense.amount)})?`,
      )
    ) {
      return;
    }
    setDeletingId(expense.id);
    try {
      await deleteExpenseAction(expense.id);
      setExpenses((prev) => prev.filter((item) => item.id !== expense.id));
      toast.success("Expense deleted");
    } catch (error: unknown) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete expense",
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Expenses</CardTitle>
          <Button type="button" size="sm" onClick={openCreate}>
            <PlusIcon className="mr-1 h-3.5 w-3.5" /> New expense
          </Button>
        </CardHeader>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No expenses logged yet.
            </p>
          ) : (
            <div className="space-y-2">
              <div className="space-y-2">
                {expenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">
                        {expense.supplier_name} —{" "}
                        {formatAmount(expense.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(expense.expense_date), "d MMM yyyy")}
                        {" · "}
                        {expense.description}
                        {expense.category &&
                          ` · ${CATEGORY_LABELS[expense.category] ?? expense.category}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(expense)}
                      >
                        <PencilIcon className="mr-1 h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === expense.id}
                        aria-label={`Delete expense: ${expense.supplier_name}`}
                        onClick={() => void handleDelete(expense)}
                      >
                        <Trash2Icon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <p className="pt-2 text-right text-sm font-medium">
                Total: {formatAmount(total)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>myDATA Documents</CardTitle>
          <p className="text-sm text-muted-foreground">
            Documents your suppliers have transmitted to AADE myDATA that
            reference this business. Read-only — not linked to the expenses
            above.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-2">
              <Label htmlFor="mydata-date-from">From</Label>
              <Input
                id="mydata-date-from"
                type="date"
                value={myDataRange.dateFrom}
                onChange={(event) =>
                  setMyDataRange((prev) => ({
                    ...prev,
                    dateFrom: event.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mydata-date-to">To</Label>
              <Input
                id="mydata-date-to"
                type="date"
                value={myDataRange.dateTo}
                onChange={(event) =>
                  setMyDataRange((prev) => ({
                    ...prev,
                    dateTo: event.target.value,
                  }))
                }
              />
            </div>
            <Button
              type="button"
              onClick={() => void handleCheckMyData()}
              disabled={isCheckingMyData}
            >
              {isCheckingMyData ? "Checking..." : "Check myDATA"}
            </Button>
          </div>

          {!hasCheckedMyData ? (
            <p className="text-sm text-muted-foreground">
              Set a date range and click &quot;Check myDATA&quot; to see
              what&apos;s on file.
            </p>
          ) : myDataDocuments.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No documents found for this period.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Supplier ΑΦΜ</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {myDataDocuments.map((doc) => (
                    <TableRow key={doc.uid || doc.mark}>
                      <TableCell>
                        {doc.issueDate
                          ? format(new Date(doc.issueDate), "d MMM yyyy")
                          : "—"}
                      </TableCell>
                      <TableCell>{doc.issuerVatNumber ?? "—"}</TableCell>
                      <TableCell>
                        {doc.invoiceType ? (
                          <>
                            <p>
                              {describeInvoiceType(doc.invoiceType) ??
                                `Τύπος ${doc.invoiceType}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {doc.invoiceType}
                            </p>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {doc.totalNetValue !== null
                          ? formatAmount(doc.totalNetValue)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {doc.totalVatAmount !== null
                          ? formatAmount(doc.totalVatAmount)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {doc.totalGrossValue !== null
                          ? formatAmount(doc.totalGrossValue)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {doc.paymentMethods.length > 0
                          ? doc.paymentMethods
                              .map(
                                (pm) =>
                                  PAYMENT_METHOD_LABELS[pm.type] ??
                                  `Type ${pm.type}`,
                              )
                              .join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {doc.downloadingInvoiceUrl && (
                          <a
                            href={doc.downloadingInvoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-primary underline"
                          >
                            View
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          setIsFormOpen(open);
          if (!open) {
            setEditingId(null);
            setForm(blankForm());
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit expense" : "New expense"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expense-supplier">Paid to</Label>
                <Input
                  id="expense-supplier"
                  value={form.supplierName}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      supplierName: event.target.value,
                    }))
                  }
                  placeholder="ΔΕΗ, landlord, ..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-date">Date</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={form.expenseDate}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      expenseDate: event.target.value,
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-description">What for</Label>
              <Input
                id="expense-description"
                value={form.description}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                placeholder="Ενοίκιο Αυγούστου"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expense-amount">Amount paid</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.amount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      amount: event.target.value,
                    }))
                  }
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-vat">Of which VAT (optional)</Label>
                <Input
                  id="expense-vat"
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.vatAmount}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      vatAmount: event.target.value,
                    }))
                  }
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="expense-afm">Supplier ΑΦΜ (optional)</Label>
                <Input
                  id="expense-afm"
                  value={form.supplierAfm}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      supplierAfm: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-category">Category (optional)</Label>
                <select
                  id="expense-category"
                  value={form.category}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      category: event.target.value,
                    }))
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat.code} value={cat.code}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expense-notes">Notes (optional)</Label>
              <Input
                id="expense-notes"
                value={form.notes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, notes: event.target.value }))
                }
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormOpen(false)}
              >
                <XIcon className="mr-1 h-3.5 w-3.5" /> Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {isSubmitting
                  ? "Saving..."
                  : editingId
                    ? "Save changes"
                    : "Log expense"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
