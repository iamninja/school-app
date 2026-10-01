import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * A receipt that covers a range of months at an agreed price. The
 * properties worth proving against real Postgres: the ledger arithmetic of
 * the worked example (a month already charged by the cron + new charges +
 * discount + receipt credit), that the cron then skips the covered months,
 * tenant isolation of the SECURITY DEFINER trigger, the agreed-price and
 * cash-limit guards, and that deleting the receipt restores the ledger.
 *
 * Periods are in 2027-28 so they are always in the future (deleting a
 * covering receipt keeps charges of months that have already started).
 */
describe("RLS: multi-month receipts", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  const admin = serviceClient();
  const createdReceiptIds: string[] = [];

  const START = "2027-09-01";
  const END = "2028-05-01";

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    teacherB = await signInAs(fixtures.teacherB.email, fixtures.password);
    await admin
      .from("students")
      .update({ tuition_amount: 120 })
      .eq("id", fixtures.studentA.id);
  }, 30000);

  afterAll(async () => {
    if (createdReceiptIds.length > 0) {
      await admin.from("receipts").delete().in("id", createdReceiptIds);
    }
    await admin
      .from("family_balance_transactions")
      .delete()
      .in("family_id", [fixtures.familyA.id, fixtures.familyB.id]);
    await cleanupFixtures(fixtures);
  }, 30000);

  async function familyBalance(): Promise<number> {
    const { data } = await admin
      .from("families")
      .select("balance")
      .eq("id", fixtures.familyA.id)
      .single();
    return Number(data?.balance ?? NaN);
  }

  async function ledger(type: string) {
    const { data } = await admin
      .from("family_balance_transactions")
      .select("id, amount, period, covering_receipt_id")
      .eq("family_id", fixtures.familyA.id)
      .eq("type", type)
      .gte("period", START)
      .lte("period", END);
    return data ?? [];
  }

  async function issue(
    client: typeof teacherA,
    series: string,
    values: Record<string, unknown>,
  ) {
    const { data: number } = await client.rpc("next_receipt_number", {
      p_series: series,
    });
    const result = await client
      .from("receipts")
      .insert({
        series,
        receipt_number: number,
        recipient_name: "RLS multi-month",
        ...values,
      })
      .select("id")
      .single();
    if (result.data) createdReceiptIds.push(result.data.id as string);
    return result;
  }

  it("posts the covered months, the discount and the credit: 120 owed + 960 + (-80) + (-400) = 600", async () => {
    // September already charged by the cron (no covering receipt).
    const cronCharge = await admin.from("family_balance_transactions").insert({
      family_id: fixtures.familyA.id,
      type: "monthly_charge",
      amount: 120,
      period: START,
      description: "Μηνιαία χρέωση (cron)",
      source: "cron",
    });
    expect(cronCharge.error).toBeNull();
    expect(await familyBalance()).toBe(120);

    const { data: receipt, error } = await issue(teacherA, "ΤΕΣΤΜ", {
      family_id: fixtures.familyA.id,
      total_amount: 400,
      payment_method: 3,
      covers_period_start: START,
      covers_period_end: END,
      covers_agreed_amount: 1000,
    });
    expect(error).toBeNull();

    const charges = await ledger("monthly_charge");
    expect(charges).toHaveLength(9);
    expect(charges.filter((c) => c.covering_receipt_id === receipt!.id)).toHaveLength(8);

    const discounts = (await ledger("adjustment")).filter(
      (row) => row.covering_receipt_id === receipt!.id,
    );
    expect(discounts).toHaveLength(1);
    expect(Number(discounts[0].amount)).toBe(-80);

    expect(await familyBalance()).toBe(600);
  });

  it("makes the monthly run skip every covered month", async () => {
    const before = (await ledger("monthly_charge")).length;

    const run = await admin.rpc("post_monthly_family_charges", {
      p_period: "2027-10-01",
      p_source: "manual",
    });
    expect(run.error).toBeNull();

    expect(await ledger("monthly_charge")).toHaveLength(before);
    expect(await familyBalance()).toBe(600);
  });

  it("ordinary follow-up receipts (no range) bring the balance to zero: 600 - 400 - 200", async () => {
    const second = await issue(teacherA, "ΤΕΣΤΜ", {
      family_id: fixtures.familyA.id,
      total_amount: 400,
      payment_method: 3,
    });
    expect(second.error).toBeNull();
    expect(await familyBalance()).toBe(200);

    const third = await issue(teacherA, "ΤΕΣΤΜ", {
      family_id: fixtures.familyA.id,
      total_amount: 200,
      payment_method: 3,
    });
    expect(third.error).toBeNull();
    expect(await familyBalance()).toBe(0);
  });

  it("deleting the covering receipt removes its future charges, discount and credit", async () => {
    const before = await familyBalance();
    const { data: rows } = await admin
      .from("receipts")
      .select("id")
      .eq("series", "ΤΕΣΤΜ")
      .not("covers_period_start", "is", null);
    const coveringId = rows![0].id as string;

    const { error } = await admin.from("receipts").delete().eq("id", coveringId);
    expect(error).toBeNull();

    // Only the cron-posted September charge remains inside the range.
    expect(await ledger("monthly_charge")).toHaveLength(1);
    expect(
      (await ledger("adjustment")).filter((r) => r.covering_receipt_id !== null),
    ).toHaveLength(0);
    // 0 before; removing +960 of future charges, -80 discount and the -400
    // credit changes the balance by -960 + 80 + 400 = -480.
    expect(await familyBalance()).toBe(before - 960 + 80 + 400);
  });

  it("rejects an agreed price above the full price of the covered months", async () => {
    const { error } = await issue(teacherA, "ΤΕΣΤΜ", {
      family_id: fixtures.familyA.id,
      total_amount: 100,
      payment_method: 7,
      covers_period_start: "2028-09-01",
      covers_period_end: "2028-10-01",
      covers_agreed_amount: 5000,
    });
    expect(error).not.toBeNull();
  });

  it("rejects a covering receipt for a family that belongs to another teacher", async () => {
    const before = await familyBalance();

    const { error } = await issue(teacherB, "ΤΕΣΤΜ", {
      family_id: fixtures.familyA.id,
      total_amount: 100,
      payment_method: 7,
      covers_period_start: "2028-09-01",
      covers_period_end: "2028-10-01",
    });

    expect(error).not.toBeNull();
    expect(await familyBalance()).toBe(before);
  });

  it("rejects a covering receipt that doesn't count toward the balance, or has no family", async () => {
    const notCounting = await issue(teacherA, "ΤΕΣΤΜ", {
      family_id: fixtures.familyA.id,
      total_amount: 100,
      payment_method: 7,
      counts_toward_balance: false,
      covers_period_start: "2028-09-01",
      covers_period_end: "2028-10-01",
    });
    expect(notCounting.error).not.toBeNull();

    const noFamily = await issue(teacherA, "ΤΕΣΤΜ", {
      total_amount: 100,
      payment_method: 7,
      covers_period_start: "2028-09-01",
      covers_period_end: "2028-10-01",
    });
    expect(noFamily.error).not.toBeNull();
  });

  it("does not let the covered range be edited after issue", async () => {
    const { data: receipt } = await issue(teacherA, "ΤΕΣΤΜ", {
      family_id: fixtures.familyA.id,
      total_amount: 100,
      payment_method: 7,
      covers_period_start: "2028-09-01",
      covers_period_end: "2028-10-01",
    });

    const { error } = await teacherA
      .from("receipts")
      .update({ covers_period_end: "2028-12-01" })
      .eq("id", receipt!.id);
    expect(error).not.toBeNull();
  });

  describe("cash limit", () => {
    it("refuses a cash receipt above 500 and accepts exactly 500", async () => {
      const over = await issue(teacherA, "ΤΕΣΤΜ", {
        family_id: fixtures.familyA.id,
        total_amount: 500.01,
        payment_method: 3,
      });
      expect(over.error).not.toBeNull();

      const exact = await issue(teacherA, "ΤΕΣΤΜ", {
        family_id: fixtures.familyA.id,
        total_amount: 500,
        payment_method: 3,
      });
      expect(exact.error).toBeNull();
    });

    it("accepts more than 500 by card", async () => {
      const { error } = await issue(teacherA, "ΤΕΣΤΜ", {
        family_id: fixtures.familyA.id,
        total_amount: 1000,
        payment_method: 7,
      });
      expect(error).toBeNull();
    });

    it("refuses a cash payment ledger row above 500", async () => {
      const { error } = await teacherA.from("family_balance_transactions").insert({
        family_id: fixtures.familyA.id,
        type: "payment",
        amount: -600,
        payment_method: 3,
        description: "cash over the limit",
      });
      expect(error).not.toBeNull();
    });
  });
});
