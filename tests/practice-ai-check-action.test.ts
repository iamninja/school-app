import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkTypedCounterexampleAction } from "@/app/practice/actions";
import { judgeCounterexampleWithAI } from "@/lib/ai-counterexample";
import { canSeeQuestion, getPracticeViewer } from "@/lib/practice-server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-forwarded-for", "7.7.7.7"]]) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/ai-counterexample", () => ({ judgeCounterexampleWithAI: vi.fn() }));
vi.mock("@/lib/practice-server", () => ({ getPracticeViewer: vi.fn(), canSeeQuestion: vi.fn(), drawPracticeRound: vi.fn() }));

const Q = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const STUDENT = { kind: "student", studentId: "stu-1", firstName: "Μαρία", grade: "lyk_c" } as const;
const QUESTION = {
  id: Q, section_id: "s", type: "counterexample", prompt: "Ο ισχυρισμός «γνησίως αύξουσα ⇒ f' > 0».", answer: "false",
  options: [
    { text: "$f(x) = x^3$", correct: true, marker: "x", reason: "$f'(0) = 0$." },
    { text: "$f(x) = x^2$", correct: false, marker: "h", reason: "Δεν είναι γνησίως αύξουσα." },
  ],
  tolerance: null, slider_min: null, slider_max: null, slider_step: null, graph: null, variables: null, condition: null,
  explanation: null, origin: null, origin_detail: null, counterexample_mode: "auto", image_path: null, source: "manual",
  source_quiz_question_id: null, position: 0, is_active: true, created_at: "2026-11-17T10:00:00Z",
};

function service(checksToday: number) {
  const client = createMockSupabaseClient({
    practice_questions: { data: QUESTION, error: null },
    practice_ai_checks: [{ data: null, error: null, count: checksToday }, { data: null, error: null }],
  });
  vi.mocked(createServiceRoleClient).mockReturnValue(client as never);
  return client;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getPracticeViewer).mockResolvedValue(STUDENT);
  vi.mocked(canSeeQuestion).mockResolvedValue(true);
});

describe("checkTypedCounterexampleAction", () => {
  it("asks the AI about an answer no option matches, and keeps the check for the teacher", async () => {
    const client = service(3);
    vi.mocked(judgeCounterexampleWithAI).mockResolvedValue({ verdict: "valid", reason: "Σωστά." });
    expect(await checkTypedCounterexampleAction({ questionId: Q, typed: "x^3 + x^5" })).toEqual({ ok: true, verdict: "valid", reason: "Σωστά.", by: "ai" });
    expect(vi.mocked(judgeCounterexampleWithAI).mock.calls[0][0]).toMatchObject({ claim: QUESTION.prompt, x0: null });
    const inserts = client.from.mock.results.flatMap((result) => result.value.insert.mock.calls);
    expect(inserts[0][0]).toMatchObject({ question_id: Q, student_id: "stu-1", typed: "x^3 + x^5", verdict: "valid" });
  });

  it("decides by the options when one matches, without the AI", async () => {
    service(0);
    expect(await checkTypedCounterexampleAction({ questionId: Q, typed: "x*x" })).toMatchObject({ ok: true, verdict: "hypothesis_fails", by: "options" });
    expect(judgeCounterexampleWithAI).not.toHaveBeenCalled();
  });

  it("stops at the day's cap", async () => {
    service(20);
    expect(await checkTypedCounterexampleAction({ questionId: Q, typed: "x^3 + x^5" })).toEqual({ ok: false, reason: "cap" });
    expect(judgeCounterexampleWithAI).not.toHaveBeenCalled();
  });

  it("is for students and the teacher only, and only for questions they can see", async () => {
    service(0);
    vi.mocked(getPracticeViewer).mockResolvedValueOnce({ kind: "guest" });
    expect(await checkTypedCounterexampleAction({ questionId: Q, typed: "x^3 + x" })).toEqual({ ok: false, reason: "unavailable" });
    vi.mocked(canSeeQuestion).mockResolvedValueOnce(false);
    expect(await checkTypedCounterexampleAction({ questionId: Q, typed: "x^3 + x" })).toEqual({ ok: false, reason: "unavailable" });
    expect(await checkTypedCounterexampleAction({ questionId: "nope", typed: "x" })).toEqual({ ok: false, reason: "unreadable" });
    expect(await checkTypedCounterexampleAction({ questionId: Q, typed: "2(x" })).toEqual({ ok: false, reason: "unreadable" });
    expect(judgeCounterexampleWithAI).not.toHaveBeenCalled();
  });

  it("offers the options when the AI can't answer", async () => {
    service(0);
    vi.mocked(judgeCounterexampleWithAI).mockResolvedValue(null);
    expect(await checkTypedCounterexampleAction({ questionId: Q, typed: "x^3 + x^5" })).toEqual({ ok: false, reason: "unavailable" });
  });
});
