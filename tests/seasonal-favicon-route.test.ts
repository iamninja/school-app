import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SITE_SETTINGS } from "@/lib/site-season";

const maybeSingle = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createPublicClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  }),
}));
vi.mock("@/lib/push/athens-time", () => ({ athensToday: () => "2026-12-10" }));

import { GET } from "@/app/seasonal-favicon.png/route";

const request = () => new Request("https://modus.example/seasonal-favicon.png");

describe("seasonal favicon", () => {
  beforeEach(() => {
    maybeSingle.mockReset();
  });

  it("sends the Santa-hat icon on the decorations' days, cached for an hour", async () => {
    maybeSingle.mockResolvedValue({ data: DEFAULT_SITE_SETTINGS, error: null });
    const response = await GET(request());
    expect(response.status).toBe(307);
    expect(response.headers.get("Location")).toBe("https://modus.example/icons/favicon-christmas-64.png");
    expect(response.headers.get("Cache-Control")).toContain("max-age=3600");
  });

  it("sends the plain icon when the hat is off", async () => {
    maybeSingle.mockResolvedValue({ data: { ...DEFAULT_SITE_SETTINGS, christmas_hat: false }, error: null });
    expect((await GET(request())).headers.get("Location")).toBe("https://modus.example/icons/favicon-64.png");
  });

  it("falls back to the plain icon when the settings can't be read", async () => {
    maybeSingle.mockImplementation(async () => {
      throw new Error("offline");
    });
    expect((await GET(request())).headers.get("Location")).toBe("https://modus.example/icons/favicon-64.png");
  });
});
