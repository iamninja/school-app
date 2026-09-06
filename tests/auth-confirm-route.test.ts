import { describe, expect, it, vi, beforeEach } from "vitest";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/auth/confirm/route";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

function request(params: Record<string, string>): NextRequest {
  const url = new URL("https://example.test/auth/confirm");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new NextRequest(url);
}

/**
 * Opus security audit finding L1, 2026-09-05: `next` came straight from
 * the query string with no validation, straight into redirect() - an open
 * redirect for a signed-in user via a crafted `next` value on an otherwise
 * legitimate confirmation link.
 */
describe("GET /auth/confirm", () => {
  beforeEach(() => {
    vi.mocked(redirect).mockClear();
    vi.mocked(createClient).mockResolvedValue({
      auth: { verifyOtp: vi.fn(async () => ({ error: null })) },
    } as never);
  });

  it("follows a same-origin relative `next` path", async () => {
    await GET(
      request({ token_hash: "abc", type: "email", next: "/protected/teacher" }),
    );
    expect(redirect).toHaveBeenCalledWith("/protected/teacher");
  });

  it("falls back to / for an absolute external `next` URL", async () => {
    await GET(
      request({ token_hash: "abc", type: "email", next: "https://evil.test" }),
    );
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("falls back to / for a protocol-relative `next` URL", async () => {
    await GET(
      request({ token_hash: "abc", type: "email", next: "//evil.test" }),
    );
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("defaults to / when `next` is absent", async () => {
    await GET(request({ token_hash: "abc", type: "email" }));
    expect(redirect).toHaveBeenCalledWith("/");
  });
});
