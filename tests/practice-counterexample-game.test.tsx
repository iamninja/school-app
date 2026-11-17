import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuestionScreen } from "@/components/practice/practice-game";
import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import type { RoundQuestion } from "@/lib/practice-server";
import { instantiate, seededRng } from "@/lib/practice-template";

vi.mock("@/app/practice/actions", () => ({
  drawPracticeRoundAction: vi.fn(),
  reportPracticeQuestionAction: vi.fn(),
  syncPracticeProgressAction: vi.fn(),
}));

const FILE = `## Ο ισχυρισμός «αν η $f$ είναι συνεχής στο $0$, τότε είναι παραγωγίσιμη στο $0$».
Type: counterexample
Answer: Λάθος
- [x] Η απόλυτη τιμή
  Συνεχής, όχι παραγωγίσιμη.
- [c] Το τετράγωνο
  Είναι παραγωγίσιμη.
- [h] Το πρόσημο
  Δεν είναι συνεχής.
Explanation: Ισχύει το αντίστροφο.

## Ο ισχυρισμός «παραγωγίσιμη στο $0$ ⇒ συνεχής στο $0$».
Type: counterexample
Answer: Σωστό
Explanation: Θεώρημα.
`;
const [falseSpec, trueSpec] = parsePracticeMarkdown(FILE).questions;
const round = (spec: typeof falseSpec): RoundQuestion => ({
  ...instantiate(spec, seededRng(1)), id: "q", sectionId: "s", sectionName: "Παράγωγος", imageUrl: null,
});

function play(spec: typeof falseSpec) {
  const onAnswer = vi.fn(() => ({ points: 10, streak: 1 }));
  render(<QuestionScreen question={round(spec)} index={0} total={5} results={[]} onAnswer={onAnswer} onNext={() => {}} />);
  return onAnswer;
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("a counterexample question in the game", () => {
  it("asks true or false first, then for the counterexample, and is right when both are", () => {
    const onAnswer = play(falseSpec);
    expect(screen.queryByRole("button", { name: /απόλυτη τιμή/ })).toBeNull();
    click("Ψευδής");
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByText(/Διάλεξε ένα αντιπαράδειγμα/)).toBeTruthy();
    click(/απόλυτη τιμή/);
    expect(onAnswer).toHaveBeenCalledWith(true, null, { mode: "options" });
    // Every option now says what it is and why.
    expect(screen.getByText("Δεν είναι συνεχής.")).toBeTruthy();
    expect(screen.getByText(/δεν ισχύει η υπόθεση/)).toBeTruthy();
  });

  it("counts a pick where the hypothesis fails as wrong, and says so", () => {
    const onAnswer = play(falseSpec);
    click("Ψευδής");
    click(/πρόσημο/);
    expect(onAnswer).toHaveBeenCalledWith(false, "h", { mode: "options" });
  });

  it("ends at step 1 when the claim is called wrong, and shows the counterexample", () => {
    const onAnswer = play(falseSpec);
    click("Αληθής");
    expect(onAnswer).toHaveBeenCalledWith(false, "claim", {});
    expect(screen.getByText(/ο ισχυρισμός είναι ψευδής/)).toBeTruthy();
    expect(screen.getAllByText(/απόλυτη τιμή/).length).toBeGreaterThan(0);
  });

  it("has one step for a true claim", () => {
    const onAnswer = play(trueSpec);
    click("Αληθής");
    expect(onAnswer).toHaveBeenCalledWith(true, null, {});
    expect(screen.queryByText(/Διάλεξε ένα αντιπαράδειγμα/)).toBeNull();
  });
});
