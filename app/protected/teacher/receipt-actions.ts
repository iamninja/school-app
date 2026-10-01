"use server";

import { createClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import { buildInvoiceXml } from "@/lib/mydata/invoice-xml";
import {
  getActiveMyDataEnvironment,
  sendInvoiceXml,
  verifyReceiptMark,
} from "@/lib/mydata/client";
import { RECEIPT_COLUMNS, attachLineItems } from "@/lib/receipts";
import {
  CASH_LIMIT_MESSAGE,
  CASH_PAYMENT_CODE,
  isCashAllowed,
} from "@/lib/payment-methods";
import type {
  BusinessProfile,
  CreateReceiptInput,
  Receipt,
  ReceiptCoveragePreview,
} from "@/lib/types/database";

const DEFAULT_SERIES = "Α";

function isFirstOfMonth(period: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(period);
}

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

  const paymentMethod = input.paymentMethod ?? CASH_PAYMENT_CODE;
  if (paymentMethod === CASH_PAYMENT_CODE && !isCashAllowed(totalAmount)) {
    throw new ExpectedError(CASH_LIMIT_MESSAGE);
  }

  const coversStart = input.coversPeriodStart || null;
  const coversEnd = input.coversPeriodEnd || null;
  const agreedAmount = input.agreedAmount ?? null;
  if (coversStart || coversEnd) {
    if (!coversStart || !coversEnd) {
      throw new ExpectedError("Choose both the first and last covered month");
    }
    if (!isFirstOfMonth(coversStart) || !isFirstOfMonth(coversEnd)) {
      throw new ExpectedError("Covered months must be the first day of a month");
    }
    if (coversEnd < coversStart) {
      throw new ExpectedError("The last covered month is before the first");
    }
    if (!input.familyId) {
      throw new ExpectedError("Pick a family to issue a multi-month receipt");
    }
    if (input.countsTowardBalance === false) {
      throw new ExpectedError(
        "A multi-month receipt must count toward the family's balance",
      );
    }
    if (
      agreedAmount !== null &&
      (!Number.isFinite(agreedAmount) || agreedAmount <= 0)
    ) {
      throw new ExpectedError("The agreed price must be greater than zero");
    }
  } else if (agreedAmount !== null) {
    throw new ExpectedError("An agreed price needs a range of covered months");
  }

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
      payment_method: paymentMethod,
      notes: input.notes?.trim() || null,
      counts_toward_balance: input.countsTowardBalance ?? true,
      covers_period_start: coversStart,
      covers_period_end: coversEnd,
      covers_agreed_amount: coversStart ? agreedAmount : null,
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
 * What a multi-month receipt would do to the family's ledger, for the form's
 * live preview: full price of the range (charges already posted + charges
 * the receipt would post) and the family's current balance. The discount and
 * balance-after are derived by the caller from these plus the agreed price
 * and receipt amount.
 */
export async function previewReceiptCoverageAction(input: {
  familyId: string;
  start: string;
  end: string;
}): Promise<ReceiptCoveragePreview> {
  const supabase = await requireTeacherSession();

  if (!isFirstOfMonth(input.start) || !isFirstOfMonth(input.end)) {
    throw new ExpectedError("Covered months must be the first day of a month");
  }
  if (input.end < input.start) {
    throw new ExpectedError("The last covered month is before the first");
  }

  const { data, error } = await supabase.rpc("preview_receipt_coverage", {
    p_family_id: input.familyId,
    p_start: input.start,
    p_end: input.end,
  });

  if (error) {
    throw new ExpectedError(error.message);
  }

  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (!row) {
    throw new ExpectedError("Could not compute a preview for these months");
  }

  return {
    periods: (row.periods as string[]) ?? [],
    monthlyAmount: Number(row.monthly_amount),
    alreadyPostedTotal: Number(row.already_posted_total),
    newChargesTotal: Number(row.new_charges_total),
    grossTotal: Number(row.gross),
    balance: Number(row.balance),
  };
}

/**
 * Transmits a receipt to myDATA and records the outcome.
 *
 * Safe to call again on a receipt that previously failed - this IS the
 * retry path. Refuses to re-send one that already has a MARK, since that
 * would file the same receipt twice with AADE.
 */
export async function submitReceiptToMyDataAction(
  receiptId: string,
): Promise<Receipt> {
  const supabase = await requireTeacherSession();

  const { data: receiptRow, error: fetchError } = await supabase
    .from("receipts")
    .select(RECEIPT_COLUMNS)
    .eq("id", receiptId)
    .single();

  if (fetchError || !receiptRow) {
    throw new Error("Receipt not found");
  }

  const [receipt] = await attachLineItems(supabase, [
    receiptRow as unknown as Omit<Receipt, "lineItems">,
  ]);

  // A sandbox MARK has no legal standing with AADE - it's not a real
  // filing, just a test-system echo. Only a production MARK represents an
  // actual invoice on file, so only that should ever permanently block
  // re-sending the same receipt (sandbox-then-production is the expected
  // workflow, not an edge case).
  if (
    receipt.mydata_status === "submitted" &&
    receipt.mydata_mark &&
    receipt.mydata_environment === "production"
  ) {
    throw new ExpectedError(
      `This receipt was already sent to myDATA production (MARK ${receipt.mydata_mark}). Re-sending would file it twice.`,
    );
  }

  const { data: profile } = await supabase
    .from("business_profile")
    .select(
      "id, business_name, afm, doy, activity_code, address, city, postal_code, phone, updated_at",
    )
    .eq("id", 1)
    .maybeSingle();

  if (!profile?.afm) {
    throw new ExpectedError(
      "Add your business ΑΦΜ in the Business tab before sending to myDATA",
    );
  }

  const environment = await getActiveMyDataEnvironment();
  const xml = buildInvoiceXml({
    receipt,
    business: profile as BusinessProfile,
  });
  const result = await sendInvoiceXml(xml);

  // Logged before the receipt update, and on both paths: the attempt
  // history is the thing you need when reconciling with AADE, so it must
  // survive even if the status write below fails.
  await supabase.from("mydata_submission_log").insert({
    receipt_id: receipt.id,
    environment,
    success: result.ok,
    mark: result.ok ? result.mark : null,
    error: result.ok ? result.warning : result.error,
    raw_response: result.raw.slice(0, 10000),
  });

  const { data: updated, error: updateError } = await supabase
    .from("receipts")
    .update(
      result.ok
        ? {
            mydata_status: "submitted",
            mydata_mark: result.mark,
            mydata_uid: result.uid,
            mydata_error: null,
            mydata_warning: result.warning,
            mydata_submitted_at: new Date().toISOString(),
            mydata_environment: environment,
          }
        : {
            mydata_status: "failed",
            mydata_error: result.error,
            mydata_warning: null,
            mydata_environment: environment,
          },
    )
    .eq("id", receipt.id)
    .select(RECEIPT_COLUMNS)
    .single();

  if (updateError) {
    throw updateError;
  }

  const [withItems] = await attachLineItems(supabase, [
    updated as unknown as Omit<Receipt, "lineItems">,
  ]);

  if (!result.ok) {
    // Surfaced to the teacher as a plain message rather than a crash - the
    // receipt itself is saved and retryable, this is not an app error.
    throw new ExpectedError(result.error);
  }

  return withItems;
}

/**
 * Re-asks AADE whether it actually holds this receipt's MARK. A MARK we
 * stored locally is not proof of anything on its own - this is what
 * catches the case where our database says "submitted" but AADE has no
 * record (or the reverse).
 */
export async function verifyReceiptWithMyDataAction(
  receiptId: string,
): Promise<Receipt> {
  const supabase = await requireTeacherSession();

  const { data: receiptRow, error: fetchError } = await supabase
    .from("receipts")
    .select(RECEIPT_COLUMNS)
    .eq("id", receiptId)
    .single();

  if (fetchError || !receiptRow) {
    throw new Error("Receipt not found");
  }

  const [receipt] = await attachLineItems(supabase, [
    receiptRow as unknown as Omit<Receipt, "lineItems">,
  ]);

  if (!receipt.mydata_mark || !receipt.mydata_environment) {
    throw new ExpectedError(
      "This receipt has no myDATA MARK yet - send it first.",
    );
  }

  // Always the environment this receipt was actually filed to, never
  // whatever's currently active - they can differ after a sandbox ->
  // production cutover, and asking the wrong one would misreport an old
  // MARK as missing.
  const result = await verifyReceiptMark(
    receipt.mydata_mark,
    receipt.mydata_environment,
  );

  await supabase.from("mydata_submission_log").insert({
    receipt_id: receipt.id,
    kind: "verify",
    environment: receipt.mydata_environment,
    success: result.ok && Boolean(result.verification?.found),
    mark: receipt.mydata_mark,
    error: !result.ok
      ? result.error
      : !result.verification?.found
        ? "MARK not found in AADE's transmitted documents"
        : null,
    raw_response: result.raw.slice(0, 10000),
  });

  if (!result.ok) {
    throw new ExpectedError(result.error);
  }

  const verifiedOk = result.verification?.found ?? false;

  const { data: updated, error: updateError } = await supabase
    .from("receipts")
    .update({
      mydata_last_verified_at: new Date().toISOString(),
      mydata_last_verified_ok: verifiedOk,
    })
    .eq("id", receipt.id)
    .select(RECEIPT_COLUMNS)
    .single();

  if (updateError) {
    throw updateError;
  }

  const [withItems] = await attachLineItems(supabase, [
    updated as unknown as Omit<Receipt, "lineItems">,
  ]);

  if (!verifiedOk) {
    throw new ExpectedError(
      `AADE has no record of MARK ${receipt.mydata_mark} in ${receipt.mydata_environment}. This receipt may need to be re-sent.`,
    );
  }

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
    .select(
      "id, mydata_status, family_id, receipt_number, covers_period_start",
    )
    .eq("id", receiptId)
    .single();

  if (fetchError || !receipt) {
    throw new Error("Receipt not found");
  }

  // Deleting the receipt that opened a multi-month deal would drop its
  // discount and future charges while later instalment receipts stay,
  // leaving the family in credit.
  if (receipt.covers_period_start && receipt.family_id) {
    const { count } = await supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("family_id", receipt.family_id)
      .gt("receipt_number", receipt.receipt_number);

    if ((count ?? 0) > 0) {
      throw new ExpectedError(
        "This receipt opened a multi-month deal and later receipts exist for the family. Delete those first.",
      );
    }
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
