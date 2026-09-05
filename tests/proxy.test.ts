import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Opus security/operational audit finding I1, 2026-09-05: the session-
 * gating middleware (proxy.ts's matcher covers every path except static
 * assets) redirects any request with no Supabase session cookie that
 * isn't "/", "/auth*", or "/demo*" - which includes Vercel Cron's daily
 * hit on /api/cron/monthly-charges, since Cron sends an Authorization
 * bearer header, never a session cookie. The route handler itself has its
 * own independent, fully sufficient auth (a constant-time-compared shared
 * secret - see app/api/cron/monthly-charges/route.ts), so exempting
 * /api/cron here doesn't weaken anything; it just stops an unrelated
 * session check from redirecting a request before that real check ever
 * runs. cron-monthly-charges-route.test.ts calls the route handler
 * directly, so it can't see this - the bug is in what runs *before* the
 * handler, not in the handler itself.
 */

const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getClaims },
  })),
}));

async function callUpdateSession(pathname: string) {
  const { updateSession } = await import("@/lib/supabase/proxy");
  const request = new NextRequest(new URL(pathname, "https://example.com"));
  return updateSession(request);
}

describe("updateSession middleware gate", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-publishable-key");
    getClaims.mockReset();
    getClaims.mockResolvedValue({ data: { claims: null } });
  });

  it("does not redirect an unauthenticated hit on /api/cron/monthly-charges", async () => {
    const response = await callUpdateSession("/api/cron/monthly-charges");
    expect(response.status).not.toBe(307);
    expect(response.headers.get("location")).toBeNull();
  });

  it("still redirects an unauthenticated hit on an ordinary protected page", async () => {
    const response = await callUpdateSession("/protected/teacher");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/");
  });

  it("still allows an unauthenticated hit on /auth/teacher-login", async () => {
    const response = await callUpdateSession("/auth/teacher-login");
    expect(response.status).not.toBe(307);
  });

  it("still allows an unauthenticated hit on /demo", async () => {
    const response = await callUpdateSession("/demo");
    expect(response.status).not.toBe(307);
  });
});
