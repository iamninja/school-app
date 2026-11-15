import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { canSeeQuestion, getPracticeViewer } from "@/lib/practice-server";
import { reportPracticeQuestionAction, syncPracticeProgressAction } from "@/app/practice/actions";
import { createMockSupabaseClient } from "./support/mock-supabase";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-forwarded-for", "9.9.9.9"]]) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/practice-server", () => ({
  getPracticeViewer: vi.fn(),
  canSeeQuestion: vi.fn(),
  drawPracticeRound: vi.fn(),
}));

const Q = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const S = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const STUDENT = { kind: "student", studentId: "stu-1", firstName: "Μαρία", grade: "lyk_b" } as const;
const answer = (over = {}) => ({ clientId: "client-0001", questionId: Q, sectionId: S, correct: true, points: 15, answeredAt: new Date().toISOString(), ...over });

beforeEach(() => vi.clearAllMocks());

describe("syncPracticeProgressAction", () => {
  it("saves nothing for a guest", async () => {
    vi.mocked(getPracticeViewer).mockResolvedValue({ kind: "guest" });
    expect(await syncPracticeProgressAction({ progress: {}, answers: [] })).toEqual({ ok: false, error: expect.any(String) });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("saves a student's progress and answers, ignoring repeats and bad rows", async () => {
    vi.mocked(getPracticeViewer).mockResolvedValue(STUDENT);
    const client = createMockSupabaseClient({ practice_progress: { data: null, error: null }, practice_answers: { data: null, error: null } });
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await syncPracticeProgressAction({
      progress: { version: 1, points: 30 },
      answers: [
        answer(),
        answer({ clientId: "x" }),
        answer({ clientId: "client-0002", questionId: "nope" }),
        answer({ clientId: "client-0003", answeredAt: "2020-01-01T00:00:00Z" }),
        answer({ clientId: "client-0004", points: 999 }),
      ],
    });

    expect(result).toEqual({ ok: true, saved: 2 });
    const progressUpsert = client.from.mock.results[0].value.upsert.mock.calls[0][0];
    expect(progressUpsert).toMatchObject({ student_id: "stu-1", data: expect.objectContaining({ points: 30 }) });
    const [rows, options] = client.from.mock.results[1].value.upsert.mock.calls[0];
    expect(rows.map((row: { client_id: string; points: number }) => [row.client_id, row.points])).toEqual([["client-0001", 15], ["client-0004", 100]]);
    expect(rows[0]).toMatchObject({ student_id: "stu-1", question_id: Q, section_id: S, correct: true });
    expect(options).toEqual({ onConflict: "student_id,client_id", ignoreDuplicates: true });
  });
});

describe("reportPracticeQuestionAction", () => {
  it("files a report for a question the player could see", async () => {
    vi.mocked(getPracticeViewer).mockResolvedValue(STUDENT);
    vi.mocked(canSeeQuestion).mockResolvedValue(true);
    const service = createMockSupabaseClient({ practice_reports: { data: null, error: null } });
    vi.mocked(createServiceRoleClient).mockReturnValue(service as never);
    expect(await reportPracticeQuestionAction({ questionId: Q, message: "  Λάθος απάντηση ", playedPrompt: "2+2" })).toEqual({ ok: true });
    expect(service.from.mock.results[0].value.insert.mock.calls[0][0]).toEqual({
      question_id: Q, student_id: "stu-1", message: "Λάθος απάντηση", played_prompt: "2+2",
    });
  });

  it("refuses questions the player couldn't have seen", async () => {
    vi.mocked(getPracticeViewer).mockResolvedValue({ kind: "guest" });
    vi.mocked(canSeeQuestion).mockResolvedValue(false);
    expect(await reportPracticeQuestionAction({ questionId: Q })).toEqual({ ok: false, error: "Άγνωστη ερώτηση." });
    expect(createServiceRoleClient).not.toHaveBeenCalled();
  });
});
