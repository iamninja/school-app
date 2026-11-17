import { describe, expect, it } from "vitest";

import { duplicateQuestions, practiceQuestionKey } from "@/lib/practice-bank";
import type { PracticeQuestionSpec } from "@/lib/practice-template";

const choice: PracticeQuestionSpec = {
  type: "choice",
  prompt: "Ποια είναι η κλίση της $y = 3x - 2$;",
  options: [{ text: "$3$", correct: true }, { text: "$-2$", correct: false }],
  explanation: "Η κλίση είναι ο συντελεστής του $x$.",
};

describe("practiceQuestionKey", () => {
  it("is the same for the same question, whatever the spacing, explanation or source", () => {
    expect(practiceQuestionKey({ ...choice, prompt: "Ποια  είναι η κλίση της\n$y = 3x - 2$; " })).toBe(practiceQuestionKey(choice));
    expect(practiceQuestionKey({ ...choice, explanation: "Άλλη διατύπωση." })).toBe(practiceQuestionKey(choice));
    expect(practiceQuestionKey({ ...choice, origin: "textbook", originDetail: "σελ. 45" })).toBe(practiceQuestionKey(choice));
  });

  it("tells apart a different answer, option, type or template", () => {
    const key = practiceQuestionKey(choice);
    expect(practiceQuestionKey({ ...choice, options: [{ text: "$3$", correct: false }, { text: "$-2$", correct: true }] })).not.toBe(key);
    expect(practiceQuestionKey({ ...choice, options: [...choice.options!, { text: "$1$", correct: false }] })).not.toBe(key);
    const number: PracticeQuestionSpec = { type: "number", prompt: "$2 + 2$", answer: "4" };
    expect(practiceQuestionKey({ ...number, answer: "5" })).not.toBe(practiceQuestionKey(number));
    expect(practiceQuestionKey({ ...number, tolerance: 0.1 })).not.toBe(practiceQuestionKey(number));
    expect(practiceQuestionKey({ ...number, variables: "a=2..9" })).not.toBe(practiceQuestionKey(number));
  });

  it("sees Σωστό and true as the same answer", () => {
    expect(practiceQuestionKey({ type: "true_false", prompt: "Το $2$ είναι άρτιος.", answer: "Σωστό" })).toBe(
      practiceQuestionKey({ type: "true_false", prompt: "Το $2$ είναι άρτιος.", answer: "true" }),
    );
  });
});

describe("duplicateQuestions", () => {
  it("returns the later copies and keeps the first", () => {
    const a = { ...choice, id: "a" };
    const b = { type: "number" as const, prompt: "$2 + 2$", answer: "4", id: "b" };
    const a2 = { ...choice, explanation: null, id: "a2" };
    const b2 = { ...b, id: "b2" };
    const a3 = { ...choice, id: "a3" };
    expect(duplicateQuestions([a, b, a2, b2, a3]).map((q) => q.id)).toEqual(["a2", "b2", "a3"]);
    expect(duplicateQuestions([a, b])).toEqual([]);
  });
});
