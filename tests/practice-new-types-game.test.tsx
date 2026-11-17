import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { shuffledIndexes } from "@/components/practice/practice-inputs";
import { QuestionScreen } from "@/components/practice/practice-game";
import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import type { RoundQuestion } from "@/lib/practice-server";
import { instantiate, seededRng, type PracticeQuestionSpec } from "@/lib/practice-template";

vi.mock("@/app/practice/actions", () => ({
  drawPracticeRoundAction: vi.fn(),
  reportPracticeQuestionAction: vi.fn(),
  syncPracticeProgressAction: vi.fn(),
}));

const spec = (text: string): PracticeQuestionSpec => {
  const parsed = parsePracticeMarkdown(text);
  expect(parsed.errors).toEqual([]);
  return parsed.questions[0];
};
const round = (question: PracticeQuestionSpec): RoundQuestion => ({
  ...instantiate(question, seededRng(1)), id: "q", sectionId: "s", sectionName: "Ενότητα", imageUrl: null,
});
function play(text: string) {
  const onAnswer = vi.fn(() => ({ points: 10, streak: 1 }));
  render(<QuestionScreen question={round(spec(text))} index={0} total={3} results={[]} onAnswer={onAnswer} onNext={() => {}} />);
  return onAnswer;
}
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const click = (name: string | RegExp) => fireEvent.click(button(name));

describe("the newer types in the game", () => {
  it("tick all that apply: checks the set, then shows what was missed", () => {
    const onAnswer = play("## Ποιοι είναι πρώτοι;\n- [x] Δύο\n- [ ] Εννιά\n- [x] Δεκατρία\n");
    expect(button("Έλεγχος")).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /Δύο/ }));
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(false);
    expect(screen.getByText("κι αυτό")).toBeInTheDocument();
  });

  it("tick all that apply: right with exactly the right ones", () => {
    const onAnswer = play("## Ποιοι είναι πρώτοι;\n- [x] Δύο\n- [ ] Εννιά\n- [x] Δεκατρία\n");
    fireEvent.click(screen.getByRole("checkbox", { name: /Δύο/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Δεκατρία/ }));
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(true);
  });

  it("ordering: tap the items in order, tap again to take one back", () => {
    const onAnswer = play("## Σειρά\n1. Πρώτο\n2. Δεύτερο\n3. Τρίτο\n");
    click("Δεύτερο");
    // The placed item moves to slot 1; tapping it there takes it back.
    click(/^1\s*Δεύτερο/);
    for (const name of ["Πρώτο", "Δεύτερο", "Τρίτο"]) click(name);
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(true);
  });

  it("ordering: a wrong order shows the right one", () => {
    const onAnswer = play("## Σειρά\n1. Πρώτο\n2. Δεύτερο\n3. Τρίτο\n");
    for (const name of ["Τρίτο", "Πρώτο", "Δεύτερο"]) click(name);
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(false);
    expect(screen.getByText("Η σωστή σειρά:")).toBeInTheDocument();
  });

  it("matching: pick a row, then its partner", () => {
    const onAnswer = play("## Ζεύγη\n- Ένα -> Α\n- Δύο -> Β\n- Τρία -> Γ\n");
    click("Τρία");
    click("Γ");
    click("Ένα");
    click("Α");
    click("Β"); // goes to the one empty row
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(true);
  });

  it("sign table: each interval switches + / −", () => {
    const onAnswer = play("## Πρόσημο\nRoots: -1, 1\nAnswer: + - +\n");
    click(/Διάστημα 1/);
    click(/Διάστημα 2/);
    click(/Διάστημα 2/);
    expect(button("Έλεγχος")).toBeDisabled();
    click(/Διάστημα 3/);
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(true);
  });

  it("interval: typed ends, brackets and ±∞", () => {
    const onAnswer = play("## Λύσε $x > 2$.\nType: interval\nAnswer: (2, +∞)\n");
    fireEvent.change(screen.getByLabelText("Αριστερό άκρο"), { target: { value: "2" } });
    click("+∞");
    click("Αριστερή αγκύλη"); // [ -> (
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(true);
  });

  it("interval: a closed end that should be open is wrong, and the answer is shown", () => {
    const onAnswer = play("## Λύσε $x > 2$.\nType: interval\nAnswer: (2, +∞)\n");
    fireEvent.change(screen.getByLabelText("Αριστερό άκρο"), { target: { value: "4/2" } });
    fireEvent.change(screen.getByLabelText("Δεξί άκρο"), { target: { value: "inf" } });
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(false);
    expect(screen.getByText(/Σωστή απάντηση:/)).toBeInTheDocument();
  });

  it("expression: checked by value, once it can be read", () => {
    const onAnswer = play("## Η παράγωγος της $x^2$.\nType: expression\nAnswer: 2x\n");
    const input = screen.getByLabelText("Η παράστασή σου");
    fireEvent.change(input, { target: { value: "2(x" } });
    expect(button("Έλεγχος")).toBeDisabled();
    fireEvent.change(input, { target: { value: "x + x" } });
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(true);
  });

  it("number: takes exact values like √2 and fractions", () => {
    const onAnswer = play("## Πόσο είναι το $\\sqrt{8}/2$;\nAnswer: sqrt(2)\nTolerance: 0.001\n");
    fireEvent.change(screen.getByLabelText("Η απάντησή σου"), { target: { value: "√2" } });
    click("Έλεγχος");
    expect(onAnswer).toHaveBeenCalledWith(true);
  });
});

describe("shuffling", () => {
  it("never leaves the items in the given order", () => {
    for (let seed = 1; seed < 50; seed++) {
      const order = shuffledIndexes(3, seededRng(seed));
      expect([...order].sort()).toEqual([0, 1, 2]);
      expect(order).not.toEqual([0, 1, 2]);
    }
  });
});
