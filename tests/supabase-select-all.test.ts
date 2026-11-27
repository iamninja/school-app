import { beforeEach, describe, expect, it, vi } from "vitest";

import { listPracticeSectionsAction } from "@/app/protected/teacher/practice-actions";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, selectAll } from "@/lib/supabase/select-all";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn() }));

beforeEach(() => vi.clearAllMocks());

describe("selectAll", () => {
  it("pages past the API's row cap until a short page", async () => {
    const table = Array.from({ length: 2345 }, (_, i) => i);
    const page = vi.fn(async (from: number, to: number) => ({ data: table.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null }));
    expect(await selectAll(page)).toEqual(table);
    expect(page.mock.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("asks once when everything fits, and throws the query's error", async () => {
    const page = vi.fn(async () => ({ data: [1, 2, 3], error: null }));
    expect(await selectAll(page)).toEqual([1, 2, 3]);
    expect(page).toHaveBeenCalledTimes(1);
    await expect(selectAll(async () => ({ data: null, error: new Error("boom") }))).rejects.toThrow("boom");
  });
});

describe("the console's section counts", () => {
  it("count every active question, not just the first 1000 (a teacher with 1233)", async () => {
    const rows = (sectionId: string, n: number) => Array.from({ length: n }, () => ({ section_id: sectionId }));
    // What the API hands back, a page at a time: the last section only shows up on page 2.
    const mock = createMockSupabaseClient({
      teachers: { data: { user_id: "teacher-1" }, error: null },
      practice_sections: {
        data: [
          { id: "a", grade: "gym_a", name: "A", position: 0, is_public: false },
          { id: "b", grade: "gym_b", name: "B1.4", position: 0, is_public: false },
        ],
        error: null,
      },
      practice_questions: [{ data: rows("a", 1000), error: null }, { data: [...rows("a", 205), ...rows("b", 28)], error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(mock as never);
    const sections = await listPracticeSectionsAction();
    expect(sections.map((section) => [section.id, section.questionCount])).toEqual([["a", 1205], ["b", 28]]);
  });
});
