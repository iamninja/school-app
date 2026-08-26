import { describe, expect, it, vi } from "vitest";
import { runMonthlyChargeRun } from "@/lib/billing/monthly-charge-run";
import { currentPeriod } from "@/lib/billing/school-year";

function fakeClient(response: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => response) };
}

describe("runMonthlyChargeRun", () => {
  it("passes the given period through to the rpc", async () => {
    const client = fakeClient({
      data: [
        {
          period: "2026-10-01",
          billable: true,
          families_charged: 2,
          total_amount: "200.00",
          skipped_reason: null,
        },
      ],
      error: null,
    });

    const result = await runMonthlyChargeRun({
      supabase: client,
      period: "2026-10-01",
      source: "manual",
      triggeredBy: "teacher-1",
    });

    expect(client.rpc).toHaveBeenCalledWith(
      "post_monthly_family_charges",
      { p_period: "2026-10-01", p_source: "manual", p_triggered_by: "teacher-1" },
    );
    expect(result.familiesCharged).toBe(2);
    expect(result.totalAmount).toBe(200);
  });

  it("defaults the period to currentPeriod() when omitted", async () => {
    const client = fakeClient({
      data: [
        {
          period: currentPeriod(),
          billable: true,
          families_charged: 0,
          total_amount: "0",
          skipped_reason: "no_families_with_charges",
        },
      ],
      error: null,
    });

    await runMonthlyChargeRun({ supabase: client, source: "cron" });

    expect(client.rpc).toHaveBeenCalledWith(
      "post_monthly_family_charges",
      expect.objectContaining({ p_period: currentPeriod() }),
    );
  });

  it("returns a clean non-throwing shape for a skipped, non-billable month", async () => {
    const client = fakeClient({
      data: [
        {
          period: "2026-07-01",
          billable: false,
          families_charged: 0,
          total_amount: "0",
          skipped_reason: "not_a_billable_month",
        },
      ],
      error: null,
    });

    const result = await runMonthlyChargeRun({
      supabase: client,
      period: "2026-07-01",
      source: "manual",
    });

    expect(result).toEqual({
      period: "2026-07-01",
      billable: false,
      familiesCharged: 0,
      totalAmount: 0,
      skippedReason: "not_a_billable_month",
    });
  });

  it("throws when the rpc reports an error", async () => {
    const client = fakeClient({ data: null, error: new Error("boom") });

    await expect(
      runMonthlyChargeRun({ supabase: client, source: "manual" }),
    ).rejects.toThrow();
  });
});
