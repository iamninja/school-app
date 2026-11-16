import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { requireTeacher } from "@/lib/auth/require-teacher";
import { ExpectedError } from "@/lib/expected-error";
import {
  copyQuizQuestionsToPracticeAction,
  createPracticeSectionAction,
  importPracticeMarkdownAction,
  reorderPracticeSectionsAction,
  savePracticeQuestionAction,
  updatePracticeSectionAction,
} from "@/app/protected/teacher/practice-actions";
import { quizQuestionToPractice, toPracticeQuestionColumns } from "@/lib/practice-bank";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/auth/require-teacher", () => ({ requireTeacher: vi.fn() }));

const SECTION = { id: "sec-1", grade: "lyk_b", name: "Η ευθεία" };
const QUESTION_ROW = {
  id: "q-1", section_id: "sec-1", type: "number", prompt: "2+2", options: null, answer: "4", tolerance: null,
  slider_min: null, slider_max: null, slider_step: null, graph: null, variables: null, condition: null,
  explanation: null, image_path: null, source: "manual", source_quiz_question_id: null, position: 0,
  is_active: true, created_at: "2026-11-15T10:00:00Z",
};

function insertsInto(client: ReturnType<typeof createMockSupabaseClient>, table: string) {
  return client.from.mock.calls
    .map(([name], index) => (name === table ? client.from.mock.results[index].value.insert.mock.calls : []))
    .flat()
    .map((call: unknown[]) => call[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireTeacher).mockResolvedValue(undefined);
});

describe("sections", () => {
  it("creates a section at the end of its grade", async () => {
    const client = createMockSupabaseClient({
      practice_sections: [
        { data: { position: 3 }, error: null },
        { data: { id: "sec-9", grade: "lyk_b", name: "Κύκλος", position: 4, is_public: false }, error: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const section = await createPracticeSectionAction({ grade: "lyk_b", name: "  Κύκλος " });
    expect(section).toEqual({ id: "sec-9", grade: "lyk_b", name: "Κύκλος", position: 4, isPublic: false, questionCount: 0 });
    expect(insertsInto(client, "practice_sections")[0]).toEqual({ teacher_id: "teacher-1", grade: "lyk_b", name: "Κύκλος", position: 4 });
  });

  it("refuses an unknown grade, an empty name and a duplicate name", async () => {
    const client = createMockSupabaseClient({
      practice_sections: [{ data: null, error: null }, { data: null, error: { code: "23505" } }],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(createPracticeSectionAction({ grade: "uni", name: "x" })).rejects.toThrow("Pick a grade");
    await expect(createPracticeSectionAction({ grade: "lyk_b", name: " " })).rejects.toThrow(ExpectedError);
    await expect(createPracticeSectionAction({ grade: "lyk_b", name: "Η ευθεία" })).rejects.toThrow(/already has a section/);
  });

  it("switches a section public", async () => {
    const client = createMockSupabaseClient({ practice_sections: [{ data: SECTION, error: null }, { data: null, error: null }] });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await updatePracticeSectionAction("sec-1", { isPublic: true });
    expect(client.from.mock.results[1].value.update.mock.calls[0][0]).toEqual({ is_public: true });
  });

  it("only reorders the teacher's own sections of that grade", async () => {
    const client = createMockSupabaseClient({ practice_sections: { data: [{ id: "a" }, { id: "b" }], error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(reorderPracticeSectionsAction("lyk_b", ["b", "zzz"])).rejects.toThrow(/reload/);
  });
});

describe("savePracticeQuestionAction", () => {
  it("refuses a question that can't be played, saying why", async () => {
    const client = createMockSupabaseClient({ practice_sections: { data: SECTION, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(
      savePracticeQuestionAction({ sectionId: "sec-1", spec: { type: "slider", prompt: "?", answer: "12", sliderMin: 0, sliderMax: 10 } }),
    ).rejects.toThrow(/outside the slider/);
  });

  it("stores only the columns of the question's type", async () => {
    const client = createMockSupabaseClient({
      practice_sections: { data: SECTION, error: null },
      practice_questions: [{ data: { position: 1 }, error: null }, { data: QUESTION_ROW, error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const saved = await savePracticeQuestionAction({
      sectionId: "sec-1",
      spec: { type: "number", prompt: " 2+2 ", answer: "4", sliderMin: 0, sliderMax: 5, options: [{ text: "x", correct: true }] },
    });
    expect(saved.id).toBe("q-1");
    expect(insertsInto(client, "practice_questions")[0]).toMatchObject({
      type: "number", prompt: "2+2", answer: "4", options: null, slider_min: null, slider_max: null,
      teacher_id: "teacher-1", section_id: "sec-1", source: "manual", position: 2,
    });
  });

  it("only accepts images from the teacher's own folder", async () => {
    const client = createMockSupabaseClient({ practice_sections: { data: SECTION, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(
      savePracticeQuestionAction({ sectionId: "sec-1", spec: { type: "number", prompt: "x", answer: "1" }, imagePath: "other/a.png" }),
    ).rejects.toThrow(/doesn't belong/);
  });
});

describe("importPracticeMarkdownAction", () => {
  const FILE = `# Πολυώνυμα
## $P(1)$ για $P(x) = x^2$;
Answer: 1

## Το $x - 1$ διαιρεί το $x^2 - 1$.
Answer: Σωστό
`;

  it("returns every problem and saves nothing when the file has mistakes", async () => {
    const client = createMockSupabaseClient({});
    vi.mocked(createClient).mockResolvedValue(client as never);
    const result = await importPracticeMarkdownAction({ grade: "lyk_b", markdown: "## Χωρίς απάντηση\nType: number" });
    expect(result).toEqual({ ok: false, errors: ['Question 1 "Χωρίς απάντηση": needs an "Answer:" line'] });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("creates the section named in the file and imports into it", async () => {
    const client = createMockSupabaseClient({
      practice_sections: [
        { data: null, error: null },
        { data: null, error: null },
        { data: { id: "sec-new", grade: "lyk_b", name: "Πολυώνυμα", position: 0, is_public: false }, error: null },
      ],
      practice_questions: [{ data: null, error: null }, { data: null, error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const result = await importPracticeMarkdownAction({ grade: "lyk_b", markdown: FILE });
    expect(result).toEqual({
      ok: true, sectionId: "sec-new", imported: 2, createdSection: true,
      sections: [{ id: "sec-new", name: "Πολυώνυμα", imported: 2, created: true }],
    });
    const rows = insertsInto(client, "practice_questions")[0] as unknown[];
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ type: "true_false", answer: "true", source: "import", section_id: "sec-new", position: 1 });
  });

  it("imports a file with several sections, filling existing ones and creating the rest", async () => {
    const client = createMockSupabaseClient({
      practice_sections: [
        { data: { id: "sec-a" }, error: null }, // "Α" exists
        { data: null, error: null }, // "Β" doesn't...
        { data: null, error: null }, // (its position)
        { data: { id: "sec-b", grade: "lyk_b", name: "Β", position: 1, is_public: false }, error: null }, // ...so it's created
      ],
      practice_questions: [
        { data: { position: 4 }, error: null }, // next position in Α: 5
        { data: null, error: null }, // Β is empty: 0
        { data: null, error: null }, // the insert
      ],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const result = await importPracticeMarkdownAction({
      grade: "lyk_b",
      markdown: "# Α\n## $1+1$;\nAnswer: 2\n# Β\n## $2+2$;\nAnswer: 4\n## $3+3$;\nAnswer: 6\n",
    });
    expect(result).toEqual({
      ok: true, sectionId: "sec-a", imported: 3, createdSection: true,
      sections: [
        { id: "sec-a", name: "Α", imported: 1, created: false },
        { id: "sec-b", name: "Β", imported: 2, created: true },
      ],
    });
    const rows = insertsInto(client, "practice_questions")[0] as { section_id: string; position: number }[];
    expect(rows.map((row) => [row.section_id, row.position])).toEqual([["sec-a", 5], ["sec-b", 0], ["sec-b", 1]]);
  });

  it("won't import questions that sit above every section heading", async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabaseClient({}) as never);
    const result = await importPracticeMarkdownAction({ grade: "lyk_b", markdown: "## $1+1$;\nAnswer: 2\n# Β\n## $2+2$;\nAnswer: 4\n" });
    expect(result).toEqual({ ok: false, errors: [expect.stringMatching(/Question 1 comes before any "# Section name" heading/)] });
  });

  it("removes the section it created when the questions can't be saved", async () => {
    const client = createMockSupabaseClient({
      practice_sections: [
        { data: null, error: null },
        { data: null, error: null },
        { data: { id: "sec-new", grade: "lyk_b", name: "Πολυώνυμα", position: 0, is_public: false }, error: null },
        { data: null, error: null },
      ],
      practice_questions: [{ data: null, error: null }, { data: null, error: { message: "violates check constraint" } }],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(importPracticeMarkdownAction({ grade: "lyk_b", markdown: FILE })).rejects.toBeTruthy();
    const sectionChains = client.from.mock.calls
      .map((call, index) => [call[0], client.from.mock.results[index].value] as const)
      .filter(([table]) => table === "practice_sections");
    const deleted = sectionChains.find(([, chain]) => chain.delete.mock.calls.length > 0);
    expect(deleted).toBeTruthy();
    expect(deleted![1].in).toHaveBeenCalledWith("id", ["sec-new"]);
  });

  it("needs a section when the file names none", async () => {
    vi.mocked(createClient).mockResolvedValue(createMockSupabaseClient({}) as never);
    const result = await importPracticeMarkdownAction({ grade: "lyk_b", markdown: "## 1+1\nAnswer: 2" });
    expect(result).toEqual({ ok: false, errors: ['Pick a section, or start the file with "# Section name"'] });
  });
});

describe("copying quiz questions", () => {
  it("maps quiz questions to practice questions", () => {
    expect(
      quizQuestionToPractice({
        question_text: "Κλίση;", question_type: "multiple_choice", model_answer: null,
        options: [
          { option_text: "-2", is_correct: false, order_index: 1 },
          { option_text: "3", is_correct: true, order_index: 0 },
        ],
      }),
    ).toEqual({ type: "choice", prompt: "Κλίση;", options: [{ text: "3", correct: true }, { text: "-2", correct: false }] });
    expect(
      quizQuestionToPractice({
        question_text: "7 πρώτος", question_type: "true_false", model_answer: null,
        options: [{ option_text: "True", is_correct: false, order_index: 0 }, { option_text: "False", is_correct: true, order_index: 1 }],
      }),
    ).toEqual({ type: "true_false", prompt: "7 πρώτος", answer: "false" });
    expect(
      quizQuestionToPractice({ question_text: "√49", question_type: "short_answer", model_answer: " $7,5$ ", options: [] }),
    ).toEqual({ type: "number", prompt: "√49", answer: "7.5" });
    expect(
      quizQuestionToPractice({ question_text: "Εξήγησε", question_type: "short_answer", model_answer: "Γιατί…", options: [] }),
    ).toBeNull();
  });

  it("refuses questions from someone else's quiz", async () => {
    const service = createMockSupabaseClient({ quiz_questions: { data: [{ quiz_id: "quiz-x" }], error: null } });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);
    const client = createMockSupabaseClient({
      practice_sections: { data: SECTION, error: null },
      quizzes: { data: [], error: null },
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    await expect(copyQuizQuestionsToPracticeAction({ sectionId: "sec-1", quizQuestionIds: ["qq-1"] })).rejects.toThrow(/aren't yours/);
  });

  it("copies what can be played and skips the rest", async () => {
    const service = createMockSupabaseClient({
      quiz_questions: [
        { data: [{ quiz_id: "quiz-1" }], error: null },
        {
          data: [
            { id: "qq-1", quiz_id: "quiz-1", question_text: "2+2", question_type: "short_answer", model_answer: "4", image_path: null, order_index: 0 },
            { id: "qq-2", quiz_id: "quiz-1", question_text: "Εξήγησε", question_type: "short_answer", model_answer: "…", image_path: null, order_index: 1 },
          ],
          error: null,
        },
      ],
      quiz_question_options: { data: [], error: null },
    });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);
    const client = createMockSupabaseClient({
      practice_sections: { data: SECTION, error: null },
      quizzes: { data: [{ id: "quiz-1" }], error: null },
      practice_questions: [{ data: null, error: null }, { data: null, error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(client as never);
    const result = await copyQuizQuestionsToPracticeAction({ sectionId: "sec-1", quizQuestionIds: ["qq-1", "qq-2"] });
    expect(result).toEqual({ copied: 1, skipped: 1 });
    expect(insertsInto(client, "practice_questions")[0]).toMatchObject({
      type: "number", answer: "4", source: "quiz", source_quiz_question_id: "qq-1",
    });
  });
});

describe("toPracticeQuestionColumns", () => {
  it("defaults a point question's graph window", () => {
    expect(toPracticeQuestionColumns({ type: "point", prompt: "?", answer: "(1, 2)" }).graph).toEqual({
      xMin: -5, xMax: 5, yMin: -5, yMax: 5, plots: [],
    });
  });
});
