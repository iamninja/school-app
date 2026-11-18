import { beforeEach, describe, expect, it, vi } from "vitest";

import { deletePracticeSectionsAction } from "@/app/protected/teacher/practice-actions";
import { createClient } from "@/lib/supabase/server";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Map() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn() }));

function client(owned: { id: string }[], questions: { id: string; image_path: string | null }[]) {
  const mock = createMockSupabaseClient({
    teachers: { data: { user_id: "teacher-1" }, error: null },
    practice_sections: [{ data: owned, error: null }, { data: null, error: null }],
    practice_questions: { data: questions, error: null },
  });
  const remove = vi.fn(async () => ({ data: null, error: null }));
  (mock as unknown as { storage: unknown }).storage = { from: vi.fn(() => ({ remove })) };
  vi.mocked(createClient).mockResolvedValue(mock as never);
  return { mock, remove };
}

beforeEach(() => vi.clearAllMocks());

describe("deletePracticeSectionsAction", () => {
  it("deletes the teacher's sections in one go and removes their images", async () => {
    const { mock, remove } = client([{ id: "s1" }, { id: "s2" }], [
      { id: "q1", image_path: "t/a.png" }, { id: "q2", image_path: null }, { id: "q3", image_path: "t/b.png" },
    ]);
    expect(await deletePracticeSectionsAction(["s1", "s2", "s1"])).toEqual({ deleted: 2, questions: 3 });
    const tables = mock.from.mock.calls.map((call) => String(call[0]));
    expect(tables.filter((table) => table === "practice_sections")).toHaveLength(2);
    expect(remove).toHaveBeenCalledWith(["t/a.png", "t/b.png"]);
  });

  it("refuses the lot if any section isn't the teacher's (or is gone)", async () => {
    client([{ id: "s1" }], []);
    await expect(deletePracticeSectionsAction(["s1", "other-teachers"])).rejects.toThrow(/no longer exist/);
  });

  it("does nothing for an empty list", async () => {
    client([], []);
    expect(await deletePracticeSectionsAction([])).toEqual({ deleted: 0, questions: 0 });
  });
});
