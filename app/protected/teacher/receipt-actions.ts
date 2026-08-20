"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import type {
  CreateReceiptInput,
  Receipt,
  ReceiptLineItem,
} from "@/lib/types/database";

const DEFAULT_SERIES = "Α";

const RECEIPT_COLUMNS =
  "id, series, receipt_number, issue_date, recipient_name, recipient_afm, recipient_address, family_id, total_amount, vat_category, notes, mydata_status, mydata_mark, mydata_uid, mydata_error, mydata_submitted_at, emailed_at, created_at";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function requireTeacherSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Not authenticated");
  }

  await requireTeacher(supabase, user.id);
  return supabase;
}

async function attachLineItems(
  supabase: SupabaseServerClient,
  receipts: Omit<Receipt, "lineItems">[],
): Promise<Receipt[]> {
  if (receipts.length === 0) {
    return [];
  }

  const { data: items, error } = await supabase
    .from("receipt_line_items")
    .select("id, receipt_id, student_id, description, amount, order_index")
    .in(
      "receipt_id",
      receipts.map((receipt) => receipt.id),
    )
    .order("order_index", { ascending: true });

  if (error) {
    throw error;
  }

  const byReceipt = new Map<string, ReceiptLineItem[]>();
  for (const item of items ?? []) {
    const list = byReceipt.get(item.receipt_id) ?? [];
    list.push({
      id: item.id,
      student_id: item.student_id,
      description: item.description,
      amount: Number(item.amount),
      order_index: item.order_index,
    });
    byReceipt.set(item.receipt_id, list);
  }

  return receipts.map((receipt) => ({
    ...receipt,
    total_amount: Number(receipt.total_amount),
    lineItems: byReceipt.get(receipt.id) ?? [],
  }));
}

export async function listReceiptsAction(): Promise<Receipt[]> {
  const supabase = await requireTeacherSession();

  const { data, error } = await supabase
    .from("receipts")
    .select(RECEIPT_COLUMNS)
    .order("receipt_number", { ascending: false });

  if (error) {
    throw error;
  }

  return attachLineItems(
    supabase,
    (data ?? []) as unknown as Omit<Receipt, "lineItems">[],
  );
}

export async function createReceiptAction(
  input: CreateReceiptInput,
): Promise<Receipt> {
  const supabase = await requireTeacherSession();

  const recipientName = input.recipientName.trim();
  if (!recipientName) {
    throw new ExpectedError("Enter who the receipt is for");
  }

  const lineItems = input.lineItems
    .map((item) => ({
      studentId: item.studentId ?? null,
      description: item.description.trim(),
      amount: Number(item.amount),
    }))
    .filter((item) => item.description || item.amount > 0);

  if (lineItems.length === 0) {
    throw new ExpectedError("Add at least one line with an amount");
  }
  for (const item of lineItems) {
    if (!item.description) {
      throw new ExpectedError("Every line needs a description");
    }
    if (!Number.isFinite(item.amount) || item.amount <= 0) {
      throw new ExpectedError(
        `"${item.description}" needs an amount greater than zero`,
      );
    }
  }

  // A receipt can't be issued without the business identity that has to
  // appear on it - better to say so plainly than to print a blank header.
  const { data: profile } = await supabase
    .from("business_profile")
    .select("business_name, afm")
    .eq("id", 1)
    .maybeSingle();

  if (!profile?.business_name || !profile?.afm) {
    throw new ExpectedError(
      "Add your business name and ΑΦΜ in the Business tab before issuing receipts",
    );
  }

  // Atomic per-series allocation - a client-side max()+1 would produce
  // duplicate or gapped numbers if two receipts were issued at once, and
  // both matter legally.
  const { data: numberData, error: numberError } = await supabase.rpc(
    "next_receipt_number",
    { p_series: DEFAULT_SERIES },
  );

  if (numberError) {
    throw numberError;
  }

  const totalAmount = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .insert({
      series: DEFAULT_SERIES,
      receipt_number: numberData as number,
      issue_date: input.issueDate || new Date().toISOString().slice(0, 10),
      recipient_name: recipientName,
      recipient_afm: input.recipientAfm?.trim() || null,
      recipient_address: input.recipientAddress?.trim() || null,
      family_id: input.familyId || null,
      total_amount: totalAmount,
      notes: input.notes?.trim() || null,
    })
    .select(RECEIPT_COLUMNS)
    .single();

  if (receiptError) {
    throw receiptError;
  }

  const { error: itemsError } = await supabase
    .from("receipt_line_items")
    .insert(
      lineItems.map((item, index) => ({
        receipt_id: receipt.id,
        student_id: item.studentId,
        description: item.description,
        amount: item.amount,
        order_index: index,
      })),
    );

  if (itemsError) {
    throw itemsError;
  }

  const [withItems] = await attachLineItems(supabase, [
    receipt as unknown as Omit<Receipt, "lineItems">,
  ]);
  return withItems;
}

/**
 * Deletes a receipt outright. Deliberately not offered in the UI once a
 * receipt has been transmitted to myDATA - at that point it has to be
 * cancelled through AADE, not erased locally, or the books disagree.
 */
export async function deleteReceiptAction(receiptId: string): Promise<void> {
  const supabase = await requireTeacherSession();

  const { data: receipt, error: fetchError } = await supabase
    .from("receipts")
    .select("id, mydata_status")
    .eq("id", receiptId)
    .single();

  if (fetchError || !receipt) {
    throw new Error("Receipt not found");
  }

  if (receipt.mydata_status === "submitted") {
    throw new ExpectedError(
      "This receipt has already been sent to myDATA and can't be deleted - it has to be cancelled through AADE instead.",
    );
  }

  const { error } = await supabase
    .from("receipts")
    .delete()
    .eq("id", receiptId);

  if (error) {
    throw error;
  }
}
