import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { drawPracticeRound, getPracticeCatalog, samplePracticeQuestion, seesPrivateSections } from "@/lib/practice-server";
import { allowDraw } from "@/lib/practice-rate-limit";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn() }));

const PUBLIC = { id: "11111111-1111-4111-8111-111111111111", grade: "lyk_b", name: "Η ευθεία", position: 0, is_public: true };
const PRIVATE = { id: "22222222-2222-4222-8222-222222222222", grade: "lyk_b", name: "Πολυώνυμα", position: 1, is_public: false };

const question = (id: string, sectionId: string) => ({
  id, section_id: sectionId, type: "number", prompt: `Πόσο κάνει ${id}?`, options: null, answer: "4", tolerance: null,
  slider_min: null, slider_max: null, slider_step: null, graph: null, variables: null, condition: null, explanation: "2+2",
  image_path: null, source: "manual", source_quiz_question_id: null, position: 0, is_active: true, created_at: "",
});

beforeEach(() => vi.clearAllMocks());

describe("who sees what", () => {
  it("lets only the centre's students and the teacher see private sections", () => {
    expect(seesPrivateSections({ kind: "guest" })).toBe(false);
    expect(seesPrivateSections({ kind: "parent" })).toBe(false);
    expect(seesPrivateSections({ kind: "student", studentId: "s1", firstName: "Μ", grade: "lyk_b" })).toBe(true);
    expect(seesPrivateSections({ kind: "teacher" })).toBe(true);
  });
});

describe("drawPracticeRound", () => {
  it("never gives a guest a private section, even when asked for it", async () => {
    const service = createMockSupabaseClient({
      practice_sections: { data: [PUBLIC, PRIVATE], error: null },
      practice_questions: [
        { data: [{ id: "q1", section_id: PUBLIC.id }], error: null },
        { data: [question("q1", PUBLIC.id)], error: null },
      ],
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);

    const round = await drawPracticeRound({ kind: "guest" }, { sectionIds: [PUBLIC.id, PRIVATE.id], mistakeIds: [], mistakesOnly: false });

    expect(round.map((q) => q.id)).toEqual(["q1"]);
    expect(round[0]).toMatchObject({ sectionName: "Η ευθεία", answer: 4, explanation: "2+2" });
    // The pool was only ever asked for the public section's questions.
    const poolChain = service.from.mock.results[1].value;
    expect(poolChain.in).toHaveBeenCalledWith("section_id", [PUBLIC.id]);
  });

  it("returns nothing when a guest asks only for private sections", async () => {
    const service = createMockSupabaseClient({ practice_sections: { data: [PRIVATE], error: null } });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);
    expect(await drawPracticeRound({ kind: "guest" }, { sectionIds: [PRIVATE.id], mistakeIds: [], mistakesOnly: false })).toEqual([]);
  });

  it("plays a mistakes round only from questions the player may see", async () => {
    const service = createMockSupabaseClient({
      practice_sections: { data: [PUBLIC, PRIVATE], error: null },
      practice_questions: [
        { data: [{ id: "q1", section_id: PUBLIC.id }], error: null },
        { data: [question("q1", PUBLIC.id)], error: null },
      ],
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);

    const round = await drawPracticeRound({ kind: "guest" }, { sectionIds: [], mistakeIds: ["q1", "q-private"], mistakesOnly: true });

    expect(round.map((q) => q.id)).toEqual(["q1"]);
    const poolChain = service.from.mock.results[1].value;
    expect(poolChain.in).toHaveBeenCalledWith("section_id", [PUBLIC.id]);
    expect(poolChain.in).toHaveBeenCalledWith("id", ["q1", "q-private"]);
  });

  it("skips a question that can't be played instead of showing it broken", async () => {
    const broken = { ...question("q2", PUBLIC.id), answer: "1/0" };
    const service = createMockSupabaseClient({
      practice_sections: { data: [PUBLIC], error: null },
      practice_questions: [
        { data: [{ id: "q1", section_id: PUBLIC.id }, { id: "q2", section_id: PUBLIC.id }], error: null },
        { data: [question("q1", PUBLIC.id), broken], error: null },
      ],
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);
    const round = await drawPracticeRound({ kind: "teacher" }, { sectionIds: [PUBLIC.id], mistakeIds: [], mistakesOnly: false });
    expect(round.map((q) => q.id)).toEqual(["q1"]);
  });
});

describe("samplePracticeQuestion", () => {
  const catalog = [{ code: "lyk_b", label: "Β Λυκείου", sections: [{ id: PUBLIC.id, name: "Η ευθεία", count: 2 }], count: 2 }];

  it("picks a question that can be answered with one tap", async () => {
    const choice = { ...question("q2", PUBLIC.id), type: "choice", answer: null, options: [{ text: "1", correct: true }, { text: "2", correct: false }] };
    const service = createMockSupabaseClient({
      practice_sections: { data: [PUBLIC], error: null },
      practice_questions: [
        { data: [{ id: "q1", section_id: PUBLIC.id }, { id: "q2", section_id: PUBLIC.id }], error: null },
        { data: [question("q1", PUBLIC.id), choice], error: null },
      ],
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);
    expect((await samplePracticeQuestion(catalog))?.id).toBe("q2");
  });

  it("is null when there's nothing to tap, or nothing public", async () => {
    const service = createMockSupabaseClient({
      practice_sections: { data: [PUBLIC], error: null },
      practice_questions: [{ data: [{ id: "q1", section_id: PUBLIC.id }], error: null }, { data: [question("q1", PUBLIC.id)], error: null }],
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);
    expect(await samplePracticeQuestion(catalog)).toBeNull();
    expect(await samplePracticeQuestion([])).toBeNull();
  });
});

describe("getPracticeCatalog", () => {
  it("lists grades with their sections and counts, leaving out empty ones", async () => {
    const empty = { ...PUBLIC, id: "33333333-3333-4333-8333-333333333333", name: "Κενή" };
    const service = createMockSupabaseClient({
      practice_sections: { data: [PUBLIC, empty], error: null },
      practice_questions: { data: [{ section_id: PUBLIC.id }, { section_id: PUBLIC.id }], error: null },
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);
    expect(await getPracticeCatalog({ kind: "guest" })).toEqual([
      { code: "lyk_b", label: "Β Λυκείου", sections: [{ id: PUBLIC.id, name: "Η ευθεία", count: 2 }], count: 2 },
    ]);
    expect(service.from.mock.results[0].value.eq).toHaveBeenCalledWith("is_public", true);
  });
});

describe("allowDraw", () => {
  it("allows 30 rounds in 5 minutes per address, then again after the window", () => {
    const start = 1_000_000;
    for (let i = 0; i < 30; i++) expect(allowDraw("1.2.3.4", start + i)).toBe(true);
    expect(allowDraw("1.2.3.4", start + 31)).toBe(false);
    expect(allowDraw("5.6.7.8", start + 31)).toBe(true);
    expect(allowDraw("1.2.3.4", start + 5 * 60 * 1000 + 31)).toBe(true);
  });
});
