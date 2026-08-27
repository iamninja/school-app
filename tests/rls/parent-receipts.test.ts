import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * Parents get read-only access to their own family's receipts (for the
 * tuition history "view receipt" flow) and to the singleton business
 * profile - new as of 20260827170752_parent-view-receipts.sql. The
 * properties worth proving against real Postgres: a parent sees their own
 * family's receipt and its line items, never another family's, never gets
 * write access, and business_profile is readable by any authenticated
 * user but not anon.
 */
describe("RLS: parent-view-receipts", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  let parentB1: Awaited<ReturnType<typeof signInAs>>;
  const admin = serviceClient();
  const createdReceiptIds: string[] = [];

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
    parentB1 = await signInAs(fixtures.parentB1.email, fixtures.password);
  }, 30000);

  afterAll(async () => {
    if (createdReceiptIds.length > 0) {
      await admin.from("receipts").delete().in("id", createdReceiptIds);
    }
    await cleanupFixtures(fixtures);
  }, 30000);

  async function insertFamilyAReceipt(lineItem?: Record<string, unknown>) {
    const { data: number } = await teacherA.rpc("next_receipt_number", {
      p_series: "ΠΓ",
    });
    const { data: receipt, error } = await teacherA
      .from("receipts")
      .insert({
        series: "ΠΓ",
        receipt_number: number,
        recipient_name: "Parent A1",
        family_id: fixtures.familyA.id,
        total_amount: 90,
      })
      .select("id")
      .single();
    if (error || !receipt) {
      throw new Error(`Failed to create fixture receipt: ${error?.message}`);
    }
    createdReceiptIds.push(receipt.id);

    if (lineItem) {
      await teacherA.from("receipt_line_items").insert({
        receipt_id: receipt.id,
        description: "Δίδακτρα",
        amount: 90,
        ...lineItem,
      });
    }
    return receipt.id;
  }

  it("lets a parent read their own family's receipt and its line items", async () => {
    const receiptId = await insertFamilyAReceipt({});

    const { data: receiptRow, error: receiptError } = await parentA1
      .from("receipts")
      .select("id, recipient_name, total_amount")
      .eq("id", receiptId)
      .single();
    expect(receiptError).toBeNull();
    expect(receiptRow?.recipient_name).toBe("Parent A1");

    const { data: lineItems, error: lineItemError } = await parentA1
      .from("receipt_line_items")
      .select("id, description, amount")
      .eq("receipt_id", receiptId);
    expect(lineItemError).toBeNull();
    expect(lineItems).toHaveLength(1);
  });

  it("hides family A's receipt from family B's parent", async () => {
    const receiptId = await insertFamilyAReceipt({});

    const { data: receiptRows } = await parentB1
      .from("receipts")
      .select("id")
      .eq("id", receiptId);
    expect(receiptRows ?? []).toHaveLength(0);

    const { data: lineItemRows } = await parentB1
      .from("receipt_line_items")
      .select("id")
      .eq("receipt_id", receiptId);
    expect(lineItemRows ?? []).toHaveLength(0);
  });

  it("blocks a parent from writing a receipt", async () => {
    const { data: number } = await teacherA.rpc("next_receipt_number", {
      p_series: "ΠΓ2",
    });
    const { error } = await parentA1.from("receipts").insert({
      series: "ΠΓ2",
      receipt_number: number ?? 1,
      recipient_name: "Should be rejected",
      family_id: fixtures.familyA.id,
      total_amount: 10,
    });
    expect(error).not.toBeNull();
  });

  it("lets any authenticated user read the business profile, but blocks anon", async () => {
    const { data: parentRead, error: parentError } = await parentA1
      .from("business_profile")
      .select("id, business_name")
      .eq("id", 1)
      .maybeSingle();
    expect(parentError).toBeNull();
    // No row necessarily exists locally, but the query itself must not be
    // denied by RLS - a null result here would also pass a broken "select
    // returns nothing" false positive, so seed one via the service client
    // if none exists yet.
    if (!parentRead) {
      await admin
        .from("business_profile")
        .upsert({ id: 1, business_name: "RLS Test Business" });
      const { data: afterSeed, error: afterSeedError } = await parentA1
        .from("business_profile")
        .select("id, business_name")
        .eq("id", 1)
        .single();
      expect(afterSeedError).toBeNull();
      expect(afterSeed?.business_name).toBe("RLS Test Business");
    }

    const anon = createClient(
      process.env.LOCAL_SUPABASE_URL!,
      process.env.LOCAL_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: anonRead } = await anon
      .from("business_profile")
      .select("id");
    expect(anonRead ?? []).toHaveLength(0);
  });
});
