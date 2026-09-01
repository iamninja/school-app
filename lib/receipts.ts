import type { SupabaseClient } from "@supabase/supabase-js";

import type { Receipt, ReceiptLineItem } from "@/lib/types/database";

/**
 * Shared between the teacher's own receipt actions and the parent
 * dashboard's read-only receipt fetch (for the tuition history "view
 * receipt" flow) - same columns, same line-item attach logic, so the two
 * can't silently drift into returning different shapes of the same table.
 */
export const RECEIPT_COLUMNS =
  "id, series, receipt_number, issue_date, recipient_name, recipient_afm, recipient_address, family_id, total_amount, vat_category, payment_method, notes, mydata_status, mydata_mark, mydata_uid, mydata_error, mydata_submitted_at, mydata_environment, mydata_last_verified_at, mydata_last_verified_ok, emailed_at, created_at, counts_toward_balance";

export async function attachLineItems(
  supabase: SupabaseClient,
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
