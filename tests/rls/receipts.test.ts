import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { signInAs, serviceClient } from "./helpers";
import { cleanupFixtures, createFixtures, type Fixtures } from "./fixtures";

/**
 * Receipts are financial records, so the two properties worth proving
 * against real Postgres are that only a teacher can reach them, and that
 * the numbering function is genuinely atomic rather than racy.
 */
describe("RLS: receipts", () => {
  let fixtures: Fixtures;
  let teacherA: Awaited<ReturnType<typeof signInAs>>;
  const createdReceiptIds: string[] = [];

  beforeAll(async () => {
    fixtures = await createFixtures();
    teacherA = await signInAs(fixtures.teacherA.email, fixtures.password);
  }, 30000);

  afterAll(async () => {
    const admin = serviceClient();
    if (createdReceiptIds.length > 0) {
      await admin.from("receipts").delete().in("id", createdReceiptIds);
    }
    await admin.from("receipt_number_counters").delete().neq("series", "");
    await cleanupFixtures(fixtures);
  }, 30000);

  it("lets a teacher issue and read back a receipt", async () => {
    const { data: number } = await teacherA.rpc("next_receipt_number", {
      p_series: "Α",
    });

    const { data, error } = await teacherA
      .from("receipts")
      .insert({
        series: "Α",
        receipt_number: number,
        recipient_name: "RLS Test Recipient",
        total_amount: 100,
      })
      .select("id, receipt_number")
      .single();

    expect(error).toBeNull();
    expect(data?.receipt_number).toBe(number);
    if (data) createdReceiptIds.push(data.id);
  });

  it("issues strictly increasing numbers under concurrent calls", async () => {
    // The whole point of doing this in Postgres rather than a client-side
    // max()+1: duplicates or gaps in a receipt sequence are a legal problem.
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        teacherA.rpc("next_receipt_number", { p_series: "ΤΕΣΤ" }),
      ),
    );

    const numbers = results
      .map((result) => result.data as number)
      .sort((a, b) => a - b);

    expect(new Set(numbers).size).toBe(10);
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("blocks a signed-out anon client from reading receipts", async () => {
    const anon = createClient(
      process.env.LOCAL_SUPABASE_URL!,
      process.env.LOCAL_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { data } = await anon
      .from("receipts")
      .select("recipient_name, total_amount");

    // RLS gates this (the grant exists, the policy denies), so the correct
    // expectation is an empty set rather than an error.
    expect(data ?? []).toHaveLength(0);
  });

  it("blocks a parent from reading receipts", async () => {
    const parent = await signInAs(fixtures.parentA1.email, fixtures.password);

    const { data } = await parent
      .from("receipts")
      .select("recipient_name, total_amount");

    expect(data ?? []).toHaveLength(0);
  });

  it("blocks a parent from burning receipt numbers", async () => {
    const parent = await signInAs(fixtures.parentA1.email, fixtures.password);

    // next_receipt_number is deliberately NOT security definer, so the
    // counters table's policy still applies to whoever calls it.
    const { error } = await parent.rpc("next_receipt_number", {
      p_series: "Α",
    });

    expect(error).not.toBeNull();
  });
});
