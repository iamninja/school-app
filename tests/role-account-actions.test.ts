import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  escapeIlikePattern,
  lookupRoleEmail,
} from "@/lib/auth/role-account-actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

describe("escapeIlikePattern", () => {
  it("leaves plain text untouched", () => {
    expect(escapeIlikePattern("nikos@example.com")).toBe(
      "nikos@example.com",
    );
  });

  it("escapes ILIKE wildcard and escape characters", () => {
    expect(escapeIlikePattern("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});

describe("lookupRoleEmail", () => {
  const toSuccess = (row: {
    id: string;
    user_id: string | null;
    first_name: string;
    last_name: string;
  }) => ({ studentId: row.id, firstName: row.first_name });

  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  });

  // Regression test for the 2026-09-05 security-audit finding (H2): `%`/`_`
  // are valid email local-part characters but are also ILIKE wildcards, so
  // an unescaped lookup let an unauthenticated caller pattern-match/
  // enumerate the whole roster (e.g. "a%") instead of checking one specific
  // address. The fix keeps the query itself case-insensitive (real emails
  // in the roster can have mixed case) but escapes wildcard metacharacters
  // first, so every character in the caller's input is matched literally.
  it("escapes wildcard characters before querying, so a pattern can't match multiple rows", async () => {
    const client = createMockSupabaseClient({
      students: { data: null, error: { message: "not found" } },
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as never);

    await lookupRoleEmail("a%_@example.com", {
      role: "student",
      table: "students",
      columns: "id, user_id, first_name, last_name",
      notFoundError: "not found",
      toSuccess,
    });

    const studentsChain = client.from.mock.results[0].value;
    expect(studentsChain.ilike).toHaveBeenCalledWith(
      "email",
      "a\\%\\_@example.com",
    );
  });

  it("still finds a real row via a case-insensitive exact match", async () => {
    const client = createMockSupabaseClient({
      students: {
        data: {
          id: "student-1",
          user_id: null,
          first_name: "Nikos",
          last_name: "Papadopoulos",
        },
        error: null,
      },
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(client as never);

    const result = await lookupRoleEmail("Nikos@Example.com", {
      role: "student",
      table: "students",
      columns: "id, user_id, first_name, last_name",
      notFoundError: "not found",
      toSuccess,
    });

    expect(result).toEqual({ exists: true, studentId: "student-1", firstName: "Nikos" });
  });
});
