import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { runMonthlyChargeRun } from "@/lib/billing/monthly-charge-run";
import { GET } from "@/app/api/cron/monthly-charges/route";

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/billing/monthly-charge-run", () => ({
  runMonthlyChargeRun: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
}));

function fakeServiceClient() {
  return {
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ data: null, error: null })),
    })),
  };
}

function request(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("https://example.test/api/cron/monthly-charges", {
    headers,
  });
}

describe("GET /api/cron/monthly-charges", () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-secret-value";
    vi.mocked(createServiceRoleClient).mockReturnValue(
      fakeServiceClient() as never,
    );
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it("returns 500 and never runs the job when CRON_SECRET is unset - fails closed, never open", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(request("Bearer whatever"));

    expect(response.status).toBe(500);
    expect(runMonthlyChargeRun).not.toHaveBeenCalled();
  });

  it("returns 401 with no authorization header", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(runMonthlyChargeRun).not.toHaveBeenCalled();
  });

  it("returns 401 with the wrong bearer token", async () => {
    const response = await GET(request("Bearer wrong-secret"));
    expect(response.status).toBe(401);
    expect(runMonthlyChargeRun).not.toHaveBeenCalled();
  });

  it("runs the job exactly once with source cron on the correct token", async () => {
    vi.mocked(runMonthlyChargeRun).mockResolvedValue({
      period: "2026-10-01",
      billable: true,
      familiesCharged: 3,
      totalAmount: 300,
      skippedReason: null,
    });

    const response = await GET(request("Bearer test-secret-value"));

    expect(response.status).toBe(200);
    expect(runMonthlyChargeRun).toHaveBeenCalledTimes(1);
    expect(runMonthlyChargeRun).toHaveBeenCalledWith(
      expect.objectContaining({ source: "cron", triggeredBy: null }),
    );
  });

  it("returns 500 and reports to Sentry when the run throws", async () => {
    vi.mocked(runMonthlyChargeRun).mockRejectedValue(new Error("db down"));

    const response = await GET(request("Bearer test-secret-value"));

    expect(response.status).toBe(500);
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
    );
  });
});
