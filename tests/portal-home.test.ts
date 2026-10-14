import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  PARENT_HOME,
  SIGNED_OUT_HOME,
  STUDENT_HOME,
  TEACHER_HOME,
  resolvePortalHome,
} from "@/lib/auth/portal-home";
import { createClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";
import { GET } from "@/app/start/route";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

type Roles = { teacher?: boolean; parent?: boolean; student?: boolean };

/**
 * A stand-in for the Supabase client that answers the three role lookups
 * (teachers / family_parents / students by user_id) and records which user
 * id each was asked about.
 */
function fakeSupabase(roles: Roles, userId: string | null = "user-1") {
  const askedFor: Array<{ table: string; userId: unknown }> = [];
  const rowFor: Record<string, unknown> = {
    teachers: roles.teacher ? { user_id: "user-1" } : null,
    family_parents: roles.parent ? { id: "parent-1" } : null,
    students: roles.student ? { id: "student-1" } : null,
  };

  const client = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: userId ? { id: userId } : null },
      })),
    },
    from: vi.fn((table: string) => {
      const chain = {
        select: () => chain,
        eq: (_column: string, value: unknown) => {
          askedFor.push({ table, userId: value });
          return chain;
        },
        limit: () => chain,
        maybeSingle: async () => ({ data: rowFor[table], error: null }),
      };
      return chain;
    }),
  };

  return { client, askedFor };
}

describe("resolvePortalHome", () => {
  it("sends a teacher to the teacher console", async () => {
    const { client } = fakeSupabase({ teacher: true });
    expect(await resolvePortalHome(client as never, "user-1")).toBe(TEACHER_HOME);
  });

  it("sends a parent to the parent portal", async () => {
    const { client } = fakeSupabase({ parent: true });
    expect(await resolvePortalHome(client as never, "user-1")).toBe(PARENT_HOME);
  });

  it("sends a student to the student portal", async () => {
    const { client } = fakeSupabase({ student: true });
    expect(await resolvePortalHome(client as never, "user-1")).toBe(STUDENT_HOME);
  });

  it("prefers teacher, then parent, then student for an account in several tables", async () => {
    expect(
      await resolvePortalHome(
        fakeSupabase({ teacher: true, parent: true, student: true }).client as never,
        "user-1",
      ),
    ).toBe(TEACHER_HOME);
    expect(
      await resolvePortalHome(
        fakeSupabase({ parent: true, student: true }).client as never,
        "user-1",
      ),
    ).toBe(PARENT_HOME);
  });

  it("sends a signed-in user with no role to the public home page", async () => {
    const { client } = fakeSupabase({});
    expect(await resolvePortalHome(client as never, "user-1")).toBe(SIGNED_OUT_HOME);
  });

  it("does not query anything for a signed-out visitor", async () => {
    const { client } = fakeSupabase({ teacher: true });
    expect(await resolvePortalHome(client as never, null)).toBe(SIGNED_OUT_HOME);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("looks each role up by the signed-in user's own id", async () => {
    const { client, askedFor } = fakeSupabase({});
    await resolvePortalHome(client as never, "user-42");

    expect(askedFor).toEqual(
      expect.arrayContaining([
        { table: "teachers", userId: "user-42" },
        { table: "family_parents", userId: "user-42" },
        { table: "students", userId: "user-42" },
      ]),
    );
  });
});

describe("GET /start", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [{ teacher: true }, "/protected/teacher"],
    [{ parent: true }, "/parent-dashboard"],
    [{ student: true }, "/student-dashboard"],
    [{}, "/"],
  ] as const)("redirects %o to %s", async (roles, path) => {
    vi.mocked(createClient).mockResolvedValue(fakeSupabase(roles).client as never);

    const response = await GET(new NextRequest("https://www.modusmath.gr/start"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://www.modusmath.gr${path}`);
  });

  it("redirects a request with no session to the public home page", async () => {
    vi.mocked(createClient).mockResolvedValue(
      fakeSupabase({ teacher: true }, null).client as never,
    );

    const response = await GET(new NextRequest("https://www.modusmath.gr/start"));

    expect(response.headers.get("location")).toBe("https://www.modusmath.gr/");
  });

  const PHONE_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
  const IPAD_UA =
    "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

  function startRequest(userAgent?: string, view?: string) {
    const headers = new Headers();
    if (userAgent) headers.set("user-agent", userAgent);
    if (view) headers.set("cookie", `modus-teacher-view=${view}`);
    return new NextRequest("https://www.modusmath.gr/start", { headers });
  }

  it.each([
    ["a phone", PHONE_UA, undefined, "/teacher-app"],
    ["a phone that chose the console", PHONE_UA, "console", "/protected/teacher"],
    ["a tablet", IPAD_UA, undefined, "/protected/teacher"],
    ["a desktop", undefined, undefined, "/protected/teacher"],
    ["a desktop that chose the companion", undefined, "companion", "/teacher-app"],
  ])("sends a teacher on %s to the right view", async (_label, userAgent, view, path) => {
    vi.mocked(createClient).mockResolvedValue(fakeSupabase({ teacher: true }).client as never);

    const response = await GET(startRequest(userAgent, view));

    expect(response.headers.get("location")).toBe(`https://www.modusmath.gr${path}`);
  });

  it("keeps parents on their portal on a phone", async () => {
    vi.mocked(createClient).mockResolvedValue(fakeSupabase({ parent: true }).client as never);

    const response = await GET(startRequest(PHONE_UA, "companion"));

    expect(response.headers.get("location")).toBe("https://www.modusmath.gr/parent-dashboard");
  });
});
