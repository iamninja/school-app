import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkTypedCounterexampleAction } from "@/app/practice/actions";
import { QuestionScreen } from "@/components/practice/practice-game";
import { judgeCounterexampleWithAI } from "@/lib/ai-counterexample";
import { getAnthropicClient } from "@/lib/anthropic-client";
import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import type { RoundQuestion } from "@/lib/practice-server";
import { instantiate, seededRng } from "@/lib/practice-template";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/anthropic-client", () => ({ getAnthropicClient: vi.fn() }));
vi.mock("@/app/practice/actions", () => ({
  checkTypedCounterexampleAction: vi.fn(),
  drawPracticeRoundAction: vi.fn(),
  reportPracticeQuestionAction: vi.fn(),
  syncPracticeProgressAction: vi.fn(),
}));

const INCREASING = `## Ο ισχυρισμός «γνησίως αύξουσα και παραγωγίσιμη στο $\\mathbb{R}$ $\\Rightarrow f' > 0$».
Type: counterexample
Answer: Λάθος
- [x] $f(x) = x^3$
  $f'(0) = 0$.
- [c] $f(x) = e^x$
  $f' > 0$.
- [h] $f(x) = x^2$
  Δεν είναι γνησίως αύξουσα.
`;

describe("the AI check (lib/ai-counterexample.ts)", () => {
  const create = vi.fn();
  beforeEach(() => {
    create.mockReset();
    vi.mocked(getAnthropicClient).mockReturnValue({ beta: { messages: { create } } } as never);
  });
  const input = {
    claim: "γνησίως αύξουσα ⇒ f' > 0",
    typed: "x^3 + x^5",
    x0: null,
    options: [{ text: "$f(x) = x^3$", marker: "x", reason: "$f'(0) = 0$." }],
    explanation: null,
  };

  it("asks for a JSON verdict, with fallbacks, and reads it", async () => {
    create.mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ verdict: "valid", reason: "Είναι γνησίως αύξουσα, αλλά $f'(0) = 0$." }) }],
    });
    expect(await judgeCounterexampleWithAI(input)).toEqual({ verdict: "valid", reason: "Είναι γνησίως αύξουσα, αλλά $f'(0) = 0$." });
    const [params] = create.mock.calls[0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
      output_config: { effort: "low", format: { type: "json_schema" } },
    });
    expect(params.messages[0].content).toContain("Student's counterexample: f(x) = x^3 + x^5");
    expect(params.messages[0].content).toContain("[the counterexample]");
  });

  it("gives null - the options instead - for a refusal, a bad answer, an error or no key", async () => {
    create.mockResolvedValueOnce({ stop_reason: "refusal", content: [] });
    expect(await judgeCounterexampleWithAI(input)).toBeNull();
    create.mockResolvedValueOnce({ stop_reason: "end_turn", content: [{ type: "text", text: '{"verdict":"maybe","reason":"?"}' }] });
    expect(await judgeCounterexampleWithAI(input)).toBeNull();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValueOnce(new Error("overloaded"));
    expect(await judgeCounterexampleWithAI(input)).toBeNull();
    quiet.mockRestore();
    vi.mocked(getAnthropicClient).mockReturnValue(null);
    expect(await judgeCounterexampleWithAI(input)).toBeNull();
  });
});

describe("the game with the AI check", () => {
  const round = (): RoundQuestion => ({
    ...instantiate(parsePracticeMarkdown(INCREASING).questions[0], seededRng(1)),
    id: "11111111-1111-4111-8111-111111111111", sectionId: "s", sectionName: "Παράγωγος", imageUrl: null, step2: "typed",
  });
  function play(typed: string) {
    const onAnswer = vi.fn(() => ({ points: 15, streak: 1 }));
    render(<QuestionScreen question={round()} index={0} total={3} results={[]} onAnswer={onAnswer} onNext={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ψευδής" }));
    fireEvent.change(screen.getByLabelText("Το αντιπαράδειγμά σου"), { target: { value: typed } });
    fireEvent.click(screen.getByRole("button", { name: "Έλεγχος" }));
    return onAnswer;
  }

  it("asks the server for an answer no option matches, and shows the AI's verdict and why", async () => {
    vi.mocked(checkTypedCounterexampleAction).mockResolvedValue({ ok: true, verdict: "valid", reason: "Σωστά: $f'(0) = 0$.", by: "ai" });
    const onAnswer = play("x^3 + x^5");
    expect(await screen.findByText(/Έλεγχος από AI/)).toBeInTheDocument();
    expect(checkTypedCounterexampleAction).toHaveBeenCalledWith({ questionId: "11111111-1111-4111-8111-111111111111", typed: "x^3 + x^5", x0: null });
    expect(onAnswer).toHaveBeenCalledWith(true, null, { mode: "typed", typed: "x^3 + x^5" });
  });

  it("stores the AI's kind of mistake like a wrong pick", async () => {
    vi.mocked(checkTypedCounterexampleAction).mockResolvedValue({ ok: true, verdict: "hypothesis_fails", reason: "Δεν είναι γνησίως αύξουσα.", by: "ai" });
    const onAnswer = play("-x^3");
    expect(await screen.findByText("✗ δεν ισχύει η υπόθεση")).toBeInTheDocument();
    expect(onAnswer).toHaveBeenCalledWith(false, "h", { mode: "typed", typed: "-x^3" });
  });

  it("says when the day's checks are used up, and offers the options", async () => {
    vi.mocked(checkTypedCounterexampleAction).mockResolvedValue({ ok: false, reason: "cap" });
    const onAnswer = play("x^3 + x^5");
    expect(await screen.findByText(/Έφτασες το όριο των ελέγχων για σήμερα/)).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("doesn't call the server for an answer an option already decides", () => {
    vi.mocked(checkTypedCounterexampleAction).mockClear();
    play("x^3");
    expect(checkTypedCounterexampleAction).not.toHaveBeenCalled();
  });
});
