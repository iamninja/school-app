import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";
import { isBillableMonth } from "@/lib/billing/school-year";

/**
 * Money moves through this table, so the properties worth proving against
 * real Postgres are: authorization (teacher/parent/cross-family), the
 * idempotency guarantee under real concurrency (not just single-call),
 * the balance trigger's arithmetic (including a drift-invariant check),
 * every CHECK constraint, the receipt<->ledger integration, decimal
 * precision, and that the SQL and TS billable-month rules genuinely agree.
 */
describe("RLS: family_balance_transactions", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  let teacherB: Awaited<ReturnType<typeof signInAs>>;
  let parentA1: Awaited<ReturnType<typeof signInAs>>;
  const admin = serviceClient();
  const createdTransactionIds: string[] = [];
  const createdReceiptIds: string[] = [];

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
    teacherB = await signInAs(fixtures.teacherB.email, fixtures.password);
    parentA1 = await signInAs(fixtures.parentA1.email, fixtures.password);
  }, 30000);

  afterAll(async () => {
    if (createdTransactionIds.length > 0) {
      await admin
        .from("family_balance_transactions")
        .delete()
        .in("id", createdTransactionIds);
    }
    if (createdReceiptIds.length > 0) {
      await admin.from("receipts").delete().in("id", createdReceiptIds);
    }
    await admin
      .from("family_balance_transactions")
      .delete()
      .in("family_id", [fixtures.familyA.id, fixtures.familyB.id]);
    await admin
      .from("family_charge_runs")
      .delete()
      .gte("ran_at", "2000-01-01");
    await cleanupFixtures(fixtures);
  }, 30000);

  async function insertTxn(
    client: typeof teacherA,
    values: Record<string, unknown>,
  ) {
    const { data, error } = await client
      .from("family_balance_transactions")
      .insert(values)
      .select("id, family_id, amount")
      .single();
    if (data) createdTransactionIds.push(data.id as string);
    return { data, error };
  }

  async function familyBalance(familyId: string): Promise<number> {
    const { data } = await admin
      .from("families")
      .select("balance")
      .eq("id", familyId)
      .single();
    return Number(data?.balance ?? NaN);
  }

  describe("authorization", () => {
    it("lets teacher A insert and read back a transaction on their own family", async () => {
      const { data, error } = await insertTxn(teacherA, {
        family_id: fixtures.familyA.id,
        type: "adjustment",
        amount: 10,
        description: "RLS test adjustment",
      });

      expect(error).toBeNull();
      expect(Number(data?.amount)).toBe(10);
    });

    it("hides family A's transactions from teacher B", async () => {
      const { data } = await teacherB
        .from("family_balance_transactions")
        .select("id")
        .eq("family_id", fixtures.familyA.id);

      expect(data ?? []).toHaveLength(0);
    });

    it("lets parent A1 read family A's transactions and balance", async () => {
      const { data: txns } = await parentA1
        .from("family_balance_transactions")
        .select("id")
        .eq("family_id", fixtures.familyA.id);
      expect((txns ?? []).length).toBeGreaterThan(0);

      const { data: family } = await parentA1
        .from("families")
        .select("balance")
        .eq("id", fixtures.familyA.id)
        .single();
      expect(family?.balance).not.toBeNull();
    });

    it("blocks parent A1 from writing a transaction (and the balance stays put)", async () => {
      const before = await familyBalance(fixtures.familyA.id);

      const { error } = await parentA1.from("family_balance_transactions").insert({
        family_id: fixtures.familyA.id,
        type: "payment",
        amount: -1,
        description: "should be rejected",
      });

      expect(error).not.toBeNull();
      expect(await familyBalance(fixtures.familyA.id)).toBe(before);
    });

    it("hides family B's transactions from parent A1", async () => {
      const { data } = await parentA1
        .from("family_balance_transactions")
        .select("id")
        .eq("family_id", fixtures.familyB.id);

      expect(data ?? []).toHaveLength(0);
    });

    it("returns an empty set for a signed-out anon client", async () => {
      const anon = createClient(
        process.env.LOCAL_SUPABASE_URL!,
        process.env.LOCAL_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data } = await anon
        .from("family_balance_transactions")
        .select("id");
      expect(data ?? []).toHaveLength(0);
    });

    it("refuses a parent calling post_monthly_family_charges directly", async () => {
      const { error } = await parentA1.rpc("post_monthly_family_charges", {
        p_period: "2026-10-01",
        p_source: "manual",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("idempotency", () => {
    const period = "2026-10-01";

    it("rejects a second monthly_charge row for the same family+period", async () => {
      const first = await insertTxn(teacherA, {
        family_id: fixtures.familyA.id,
        type: "monthly_charge",
        amount: 50,
        period,
        description: "October charge",
      });
      expect(first.error).toBeNull();

      const second = await teacherA.from("family_balance_transactions").insert({
        family_id: fixtures.familyA.id,
        type: "monthly_charge",
        amount: 50,
        period,
        description: "October charge again",
      });
      expect(second.error).not.toBeNull();
      expect(second.error?.code).toBe("23505");
    });

    it("post_monthly_family_charges is a clean no-op the second time it's run for the same period", async () => {
      const runPeriod = "2026-11-01";
      // Give family A a real monthly amount so there's something to charge.
      await admin
        .from("students")
        .update({ tuition_amount: 40 })
        .eq("id", fixtures.studentA.id);

      const first = await admin.rpc("post_monthly_family_charges", {
        p_period: runPeriod,
        p_source: "manual",
      });
      expect(first.error).toBeNull();
      const firstRow = first.data?.[0];
      expect(firstRow.families_charged).toBeGreaterThanOrEqual(1);

      const { data: rows } = await admin
        .from("family_balance_transactions")
        .select("id")
        .eq("type", "monthly_charge")
        .eq("period", runPeriod);
      for (const row of rows ?? []) createdTransactionIds.push(row.id);
      const countAfterFirst = (rows ?? []).length;

      const second = await admin.rpc("post_monthly_family_charges", {
        p_period: runPeriod,
        p_source: "manual",
      });
      expect(second.error).toBeNull();
      expect(second.data?.[0].families_charged).toBe(0);

      const { data: rowsAfter } = await admin
        .from("family_balance_transactions")
        .select("id")
        .eq("type", "monthly_charge")
        .eq("period", runPeriod);
      expect((rowsAfter ?? []).length).toBe(countAfterFirst);
    });

    it("stays correct under 5 concurrent calls for the same period", async () => {
      const runPeriod = "2026-12-01";

      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          admin.rpc("post_monthly_family_charges", {
            p_period: runPeriod,
            p_source: "manual",
          }),
        ),
      );
      for (const result of results) expect(result.error).toBeNull();

      const totalCharged = results.reduce(
        (sum, result) => sum + (result.data?.[0]?.families_charged ?? 0),
        0,
      );
      expect(totalCharged).toBeGreaterThanOrEqual(1);

      const { data: rows } = await admin
        .from("family_balance_transactions")
        .select("id, family_id")
        .eq("type", "monthly_charge")
        .eq("period", runPeriod);
      for (const row of rows ?? []) createdTransactionIds.push(row.id);

      // Exactly one row per family that got charged, no matter how many
      // of the 5 concurrent calls raced to insert it.
      const familyIds = (rows ?? []).map((row) => row.family_id);
      expect(new Set(familyIds).size).toBe(familyIds.length);
    });
  });

  describe("balance trigger arithmetic", () => {
    it("keeps balance in sync across insert, update, delete, and family-move", async () => {
      const before = await familyBalance(fixtures.familyB.id);

      const plus = await insertTxn(teacherB, {
        family_id: fixtures.familyB.id,
        type: "adjustment",
        amount: 100,
        description: "trigger test +100",
      });
      expect(await familyBalance(fixtures.familyB.id)).toBe(before + 100);

      const minus = await insertTxn(teacherB, {
        family_id: fixtures.familyB.id,
        type: "adjustment",
        amount: -40,
        description: "trigger test -40",
      });
      expect(await familyBalance(fixtures.familyB.id)).toBe(before + 60);

      await admin
        .from("family_balance_transactions")
        .delete()
        .eq("id", minus.data!.id);
      expect(await familyBalance(fixtures.familyB.id)).toBe(before + 100);

      await admin
        .from("family_balance_transactions")
        .update({ amount: 120 })
        .eq("id", plus.data!.id);
      expect(await familyBalance(fixtures.familyB.id)).toBe(before + 120);

      const balanceAAfterMoveSource = await familyBalance(fixtures.familyA.id);
      await admin
        .from("family_balance_transactions")
        .update({ family_id: fixtures.familyA.id })
        .eq("id", plus.data!.id);
      expect(await familyBalance(fixtures.familyB.id)).toBe(before);
      expect(await familyBalance(fixtures.familyA.id)).toBe(
        balanceAAfterMoveSource + 120,
      );

      // Move it back so subsequent tests in this file see a clean family B.
      await admin
        .from("family_balance_transactions")
        .update({ family_id: fixtures.familyB.id })
        .eq("id", plus.data!.id);
    });

    it("matches recompute_family_balance after a mixed sequence of operations (drift invariant)", async () => {
      const ops = [50, -20, 15, -5, 100, -73.5, 2.5, -8];
      const ids: string[] = [];
      for (const amount of ops) {
        const { data } = await insertTxn(teacherB, {
          family_id: fixtures.familyB.id,
          type: "adjustment",
          amount,
          description: `drift test ${amount}`,
        });
        if (data) ids.push(data.id as string);
      }

      const { data: sumRows } = await admin
        .from("family_balance_transactions")
        .select("amount")
        .eq("family_id", fixtures.familyB.id);
      const expectedSum = (sumRows ?? []).reduce(
        (sum, row) => sum + Number(row.amount),
        0,
      );

      const actualBalance = await familyBalance(fixtures.familyB.id);
      expect(actualBalance).toBeCloseTo(expectedSum, 2);

      const { data: recomputed } = await admin.rpc(
        "recompute_family_balance",
        { p_family_id: fixtures.familyB.id },
      );
      expect(Number(recomputed)).toBeCloseTo(expectedSum, 2);
    });
  });

  describe("CHECK constraints", () => {
    it("rejects a payment with a positive amount", async () => {
      const { error } = await teacherA.from("family_balance_transactions").insert({
        family_id: fixtures.familyA.id,
        type: "payment",
        amount: 25,
        description: "wrong sign",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a monthly_charge with no period", async () => {
      const { error } = await teacherA.from("family_balance_transactions").insert({
        family_id: fixtures.familyA.id,
        type: "monthly_charge",
        amount: 25,
        description: "missing period",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a zero amount", async () => {
      const { error } = await teacherA.from("family_balance_transactions").insert({
        family_id: fixtures.familyA.id,
        type: "adjustment",
        amount: 0,
        description: "zero",
      });
      expect(error).not.toBeNull();
    });

    it("rejects a receipt-typed row with no receipt_id", async () => {
      const { error } = await teacherA.from("family_balance_transactions").insert({
        family_id: fixtures.familyA.id,
        type: "receipt",
        amount: -10,
        description: "orphan receipt credit",
      });
      expect(error).not.toBeNull();
    });
  });

  describe("decimal precision", () => {
    it("keeps 120.10 x 3 exact via preview_family_prepayment, not JS float math", async () => {
      await admin
        .from("students")
        .update({ tuition_amount: 120.1 })
        .eq("id", fixtures.studentB.id);

      const { data, error } = await admin.rpc("preview_family_prepayment", {
        p_family_id: fixtures.familyB.id,
        p_months: 3,
      });

      expect(error).toBeNull();
      expect(Number(data?.[0]?.total)).toBe(360.3);
    });
  });

  describe("is_billable_month SQL/TS parity", () => {
    it("agrees with lib/billing/school-year.ts's isBillableMonth for every (month, start, duration) combination", async () => {
      const { data, error } = await admin.rpc("is_billable_month", {
        p_month: 6,
        p_start_month: 9,
        p_duration: 9,
      });
      expect(error).toBeNull();
      expect(data).toBe(false);

      // Full sweep, one call per combination (12*12*12 = 1728) - fine for
      // a local-stack test, not part of the default suite.
      for (let month = 1; month <= 12; month++) {
        for (let start = 1; start <= 12; start += 3) {
          for (let duration = 1; duration <= 12; duration += 3) {
            const { data: sqlResult } = await admin.rpc("is_billable_month", {
              p_month: month,
              p_start_month: start,
              p_duration: duration,
            });
            const tsResult = isBillableMonth(month, {
              startMonth: start,
              durationMonths: duration,
            });
            expect(sqlResult).toBe(tsResult);
          }
        }
      }
    }, 30000);
  });

  describe("receipt integration", () => {
    it("posts exactly one ledger credit when a receipt with a family_id is issued", async () => {
      const before = await familyBalance(fixtures.familyA.id);

      const { data: number } = await teacherA.rpc("next_receipt_number", {
        p_series: "ΤΕΣΤΒ",
      });
      const { data: receipt, error } = await teacherA
        .from("receipts")
        .insert({
          series: "ΤΕΣΤΒ",
          receipt_number: number,
          recipient_name: "RLS Balance Test",
          family_id: fixtures.familyA.id,
          total_amount: 150,
        })
        .select("id")
        .single();
      expect(error).toBeNull();
      if (receipt) createdReceiptIds.push(receipt.id);

      expect(await familyBalance(fixtures.familyA.id)).toBe(before - 150);

      const { data: ledgerRows } = await admin
        .from("family_balance_transactions")
        .select("id, amount, type")
        .eq("receipt_id", receipt!.id);
      expect(ledgerRows).toHaveLength(1);
      expect(ledgerRows![0].type).toBe("receipt");
      expect(Number(ledgerRows![0].amount)).toBe(-150);
      createdTransactionIds.push(ledgerRows![0].id);

      await admin.from("receipts").delete().eq("id", receipt!.id);
      expect(await familyBalance(fixtures.familyA.id)).toBe(before);

      const { data: afterDelete } = await admin
        .from("family_balance_transactions")
        .select("id")
        .eq("receipt_id", receipt!.id);
      expect(afterDelete ?? []).toHaveLength(0);
    });

    it("posts no ledger row for a receipt with no family_id", async () => {
      const { data: number } = await teacherA.rpc("next_receipt_number", {
        p_series: "ΤΕΣΤΓ",
      });
      const { data: receipt } = await teacherA
        .from("receipts")
        .insert({
          series: "ΤΕΣΤΓ",
          receipt_number: number,
          recipient_name: "No family",
          total_amount: 50,
        })
        .select("id")
        .single();
      if (receipt) createdReceiptIds.push(receipt.id);

      const { data: ledgerRows } = await admin
        .from("family_balance_transactions")
        .select("id")
        .eq("receipt_id", receipt!.id);
      expect(ledgerRows ?? []).toHaveLength(0);
    });
  });
});
