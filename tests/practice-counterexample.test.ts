import { describe, expect, it } from "vitest";

import { practiceQuestionKey, toPracticeQuestionColumns } from "@/lib/practice-bank";
import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import { checkCounterexample, instantiate, seededRng, trueFalseValue } from "@/lib/practice-template";

// The plan's own examples (docs/practice-counterexample-plan.md).
const FALSE_CLAIM = `## Ο ισχυρισμός «αν η $f$ είναι παραγωγίσιμη και γνησίως αύξουσα στο $\\mathbb{R}$, τότε $f'(x) > 0$ για κάθε $x \\in \\mathbb{R}$».
Type: counterexample
Answer: Λάθος
- [x] $f(x) = x^3$
  Είναι γνησίως αύξουσα, αλλά $f'(0) = 0$.
- [c] $f(x) = e^x$
  Ισχύει $f'(x) = e^x > 0$ για κάθε $x$, οπότε δεν διαψεύδει τον ισχυρισμό.
- [h] $f(x) = x^2$
    Δεν είναι γνησίως αύξουσα
    στο $\\mathbb{R}$.
- [h] $f(x) = -x^3$
\tΕίναι γνησίως φθίνουσα.
Explanation: Ισχύει μόνο το «$f' > 0 \\Rightarrow$ γνησίως αύξουσα». Το αντίστροφο είναι ψευδές.
Source: Πανελλαδικές 2020 · Θέμα Α
`;
const TRUE_CLAIM = `## Ο ισχυρισμός «αν η $f$ είναι παραγωγίσιμη στο $x_0$, τότε είναι συνεχής στο $x_0$».
Type: counterexample
Answer: Σωστό
Explanation: Είναι θεώρημα.
`;

describe("counterexample questions in a file", () => {
  it("reads the claim, the markers and the indented reasons (any indentation, several lines joined)", () => {
    const parsed = parsePracticeMarkdown(FALSE_CLAIM + "\n" + TRUE_CLAIM);
    expect(parsed.errors).toEqual([]);
    const [q, t] = parsed.questions;
    expect(q.type).toBe("counterexample");
    expect(q.answer).toBe("Λάθος");
    expect(q.options!.map((option) => [option.marker, option.reason])).toEqual([
      ["x", "Είναι γνησίως αύξουσα, αλλά $f'(0) = 0$."],
      ["c", "Ισχύει $f'(x) = e^x > 0$ για κάθε $x$, οπότε δεν διαψεύδει τον ισχυρισμό."],
      ["h", "Δεν είναι γνησίως αύξουσα στο $\\mathbb{R}$."],
      ["h", "Είναι γνησίως φθίνουσα."],
    ]);
    expect(q.options!.filter((option) => option.correct).map((option) => option.text)).toEqual(["$f(x) = x^3$"]);
    expect(q.origin).toBe("panhellenic");
    expect(t).toMatchObject({ type: "counterexample", answer: "Σωστό" });
    expect(t.options ?? null).toBeNull();
  });

  it("refuses what can't be played, with the reason", () => {
    const errors = (text: string) => parsePracticeMarkdown(text).errors.join("\n");
    expect(errors(TRUE_CLAIM.replace("Explanation:", "- [x] $x$\nExplanation:"))).toMatch(/a true claim has no options/);
    expect(errors(FALSE_CLAIM.replace("- [x]", "- [h]"))).toMatch(/exactly one counterexample "- \[x\]" \(found 0\)/);
    expect(errors(FALSE_CLAIM.replace("Answer: Λάθος", "Answer: ίσως"))).toMatch(/Σωστό or Λάθος/);
    expect(errors(FALSE_CLAIM.replace("Answer: Λάθος\n", ""))).toMatch(/needs "Answer: Σωστό"/);
    expect(errors(FALSE_CLAIM.replace("Explanation:", "Variables: a=1..3\nExplanation:"))).toMatch(/Variables, Condition\) aren't supported/);
    // Without the type, [h]/[c] or reason lines point to it.
    expect(errors(FALSE_CLAIM.replace("Type: counterexample\n", ""))).toMatch(/\[h\] and \[c\] marks only go with "Type: counterexample"/);
    expect(errors("## Ποιο;\n- [x] α\n  γιατί\n- [ ] β\n")).toMatch(/lines under an option only go with "Type: counterexample"/);
    // ...and a plain multiple-choice question is as before.
    expect(errors("## Ποιο;\n- [x] α\n- [ ] β\n")).toBe("");
  });

  it("accepts Αληθής/Ψευδής as answers, here and for true/false questions", () => {
    expect(parsePracticeMarkdown(FALSE_CLAIM.replace("Answer: Λάθος", "Answer: Ψευδής")).errors).toEqual([]);
    expect(["Αληθής", "αληθης", "Ψευδής", "ψευδης"].map(trueFalseValue)).toEqual([true, true, false, false]);
    expect(parsePracticeMarkdown("## Το 2 είναι άρτιος.\nAnswer: Αληθής\n").questions[0].type).toBe("true_false");
  });
});

describe("playing and checking", () => {
  const spec = parsePracticeMarkdown(FALSE_CLAIM).questions[0];
  const played = instantiate(spec, seededRng(1));
  const index = (marker: string) => played.options.findIndex((option) => option.marker === marker);

  it("is right only when both steps are", () => {
    expect(checkCounterexample(played, false, index("x"))).toEqual({ correct: true, detail: null });
    expect(checkCounterexample(played, true, null)).toEqual({ correct: false, detail: "claim" });
    expect(checkCounterexample(played, false, index("h"))).toEqual({ correct: false, detail: "h" });
    expect(checkCounterexample(played, false, index("c"))).toEqual({ correct: false, detail: "c" });
  });

  it("calls a pick marked [ ] 'other'", () => {
    const other = instantiate({ ...spec, options: [...spec.options!.slice(0, 2), { text: "$1/x$", correct: false, marker: "", reason: "Δεν ορίζεται στο 0." }] }, seededRng(1));
    expect(checkCounterexample(other, false, 2)).toEqual({ correct: false, detail: "other" });
  });

  it("checks a true claim in one step", () => {
    const truth = instantiate(parsePracticeMarkdown(TRUE_CLAIM).questions[0], seededRng(1));
    expect(truth.options).toEqual([]);
    expect(checkCounterexample(truth, true, null)).toEqual({ correct: true, detail: null });
    expect(checkCounterexample(truth, false, null)).toEqual({ correct: false, detail: "claim" });
  });
});

describe("storing", () => {
  it("keeps markers and reasons with the options, and true/false as the answer", () => {
    const [q, t] = parsePracticeMarkdown(FALSE_CLAIM + "\n" + TRUE_CLAIM).questions;
    const columns = toPracticeQuestionColumns(q);
    expect(columns.answer).toBe("false");
    expect(columns.options![1]).toEqual({
      text: "$f(x) = e^x$", correct: false, marker: "c",
      reason: "Ισχύει $f'(x) = e^x > 0$ για κάθε $x$, οπότε δεν διαψεύδει τον ισχυρισμό.",
    });
    expect(toPracticeQuestionColumns(t)).toMatchObject({ answer: "true", options: null });
  });

  it("tells questions apart by their markers in the duplicate check", () => {
    const q = parsePracticeMarkdown(FALSE_CLAIM).questions[0];
    const swapped = { ...q, options: q.options!.map((option) => (option.marker === "c" ? { ...option, marker: "h" as const } : option)) };
    expect(practiceQuestionKey(swapped)).not.toBe(practiceQuestionKey(q));
  });
});
