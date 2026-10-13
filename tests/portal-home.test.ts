import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  PARENT_HOME,
  SIGNED_OUT_HOME,
  STUDENT_HOME,
  TEACHER_HOME,
  resolvePortalHome,
} from "@/lib/auth/portal-home";
import { createClient } from "@/lib/supabase/server";
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

    const response = await GET(new Request("https://www.modusmath.gr/start"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://www.modusmath.gr${path}`);
  });

  it("redirects a request with no session to the public home page", async () => {
    vi.mocked(createClient).mockResolvedValue(
      fakeSupabase({ teacher: true }, null).client as never,
    );

    const response = await GET(new Request("https://www.modusmath.gr/start"));

    expect(response.headers.get("location")).toBe("https://www.modusmath.gr/");
  });
});
