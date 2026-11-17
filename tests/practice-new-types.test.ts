import { describe, expect, it } from "vitest";

import { practiceQuestionKey, toPracticeQuestionColumns } from "@/lib/practice-bank";
import { exprToTex, normalizeTyped } from "@/lib/practice-expr";
import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import {
  checkExpression,
  checkInterval,
  checkMatch,
  checkMulti,
  checkOrder,
  checkSigns,
  formatInterval,
  instantiate,
  parseIntervalAnswer,
  parseSignAnswer,
  parseTypedExpression,
  parseTypedValue,
  seededRng,
  validatePracticeQuestion,
  type PracticeQuestionSpec,
} from "@/lib/practice-template";

const FILE = `# Πρώτα βήματα

## Ποιοι αριθμοί είναι πρώτοι;
- [x] $2$
- [ ] $9$
- [x] $13$
- [ ] $1$

## Βάλε τους αριθμούς σε σειρά, από τον μικρότερο.
1. $-2$
2. $\\frac{1}{3}$
3. $\\sqrt{2}$

## Αντιστοίχισε κάθε συνάρτηση με την παράγωγό της.
- $x^2$ -> $2x$
- $\\ln x$ -> $\\frac{1}{x}$
- $e^x$ → $e^x$

## Το πρόσημο της $f'(x) = x^2 - 1$.
Roots: -1, 1
Row: $f'(x)$
Answer: + - +

## Λύσε την $x^2 < 4$.
Type: interval
Answer: (-2, 2)

## Η παράγωγος της $x^3 + {{a}}x$.
Type: expression
Answer: 3x^2 + a
Variables: a=2..5
`;
const parsed = parsePracticeMarkdown(FILE);
const [multi, order, match, signs, interval, expression] = parsed.questions;
const play = (spec: PracticeQuestionSpec) => instantiate(spec, seededRng(7));

describe("the new types in a file", () => {
  it("reads every type, working most of them out without Type:", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions.map((q) => q.type)).toEqual(["multi", "order", "match", "sign_table", "interval", "expression"]);
    expect(order.options!.map((option) => option.text)).toEqual(["$-2$", "$\\frac{1}{3}$", "$\\sqrt{2}$"]);
    expect(match.options!.map((option) => [option.text, option.match])).toEqual([
      ["$x^2$", "$2x$"],
      ["$\\ln x$", "$\\frac{1}{x}$"],
      ["$e^x$", "$e^x$"],
    ]);
    expect(signs).toMatchObject({ options: [{ text: "-1" }, { text: "1" }], answer: "$f'(x)$ | + - +" });
  });

  it("says what's wrong, per type", () => {
    const errors = (text: string) => parsePracticeMarkdown(text).errors.join("\n");
    expect(errors("## Ποιοι;\nType: multi\n- [ ] α\n- [ ] β\n")).toMatch(/at least one correct option/);
    expect(errors("## Σειρά\n1. α\n")).toMatch(/2 to 8 items/);
    expect(errors("## Σειρά\n1. α\n2. α\n")).toMatch(/Two items came out the same/);
    expect(errors("## Σειρά\n1. α\n2. β\nAnswer: 1\n")).toMatch(/has no "Answer:"/);
    expect(errors("## Ζεύγη\n- α -> 1\n")).toMatch(/2 to 6 pairs/);
    expect(errors("## Πρόσημο\nRoots: -1, 1\nAnswer: + -\n")).toMatch(/3 intervals - give that many signs \(found 2\)/);
    expect(errors("## Πρόσημο\nRoots: 2, -1\nAnswer: + - +\n")).toMatch(/smallest to largest/);
    expect(errors("## Πρόσημο\nRoots: 1\nAnswer: + x\n")).toMatch(/like "\+ - \+"/);
    expect(errors("## Διάστημα\nType: interval\nAnswer: 3\n")).toMatch(/looks like "\[-1, 3\)"/);
    expect(errors("## Διάστημα\nType: interval\nAnswer: [3, 1]\n")).toMatch(/must be below its right end/);
    expect(errors("## Διάστημα\nType: interval\nAnswer: (+∞, 1)\n")).toMatch(/-∞ only on the left/);
    expect(errors("## Παράσταση\nType: expression\nAnswer: 2y\n")).toMatch(/"y" isn't defined/);
    expect(errors("## Ποιο;\n1. α\n2. β\n- [x] γ\n- [ ] δ\n")).toMatch(/numbered items .* only go with "Type: order"/);
    expect(errors("## Ποιο;\nRoots: 1\n- [x] γ\n- [ ] δ\n")).toMatch(/Roots and Row only go with "Type: sign_table"/);
  });

  it("still asks for one [x] when choice is written out, and takes several as multi otherwise", () => {
    expect(parsePracticeMarkdown("## Ποιο;\nType: choice\n- [x] α\n- [x] β\n").errors.join()).toMatch(/exactly one correct option/);
    expect(parsePracticeMarkdown("## Ποιο;\n- [x] α\n- [x] β\n").questions[0].type).toBe("multi");
  });
});

describe("checking", () => {
  it("multi: exactly the right ones", () => {
    const q = play(multi);
    const right = q.options.flatMap((option, i) => (option.correct ? [i] : []));
    expect(checkMulti(q, right)).toBe(true);
    expect(checkMulti(q, right.slice(1))).toBe(false);
    expect(checkMulti(q, [...right, q.options.findIndex((option) => !option.correct)])).toBe(false);
  });

  it("order and match: every position, every pair", () => {
    const o = play(order);
    expect(checkOrder(o, [0, 1, 2])).toBe(true);
    expect(checkOrder(o, [1, 0, 2])).toBe(false);
    expect(checkOrder(o, [0, 1])).toBe(false);
    const m = play(match);
    expect(checkMatch(m, [0, 1, 2])).toBe(true);
    expect(checkMatch(m, [1, 0, 2])).toBe(false);
    expect(checkMatch(m, [0, 1, null])).toBe(false);
  });

  it("sign table: the signs left to right, with the row's label", () => {
    const s = play(signs);
    expect(s.signs).toEqual([1, -1, 1]);
    expect(s.signLabel).toBe("$f'(x)$");
    expect(checkSigns(s, [1, -1, 1])).toBe(true);
    expect(checkSigns(s, [1, 1, 1])).toBe(false);
    expect(checkSigns(s, [1, -1, null])).toBe(false);
    expect(parseSignAnswer("− + −")).toEqual({ label: null, signs: [-1, 1, -1] });
  });

  it("interval: both ends and both brackets, infinity always open", () => {
    const i = play(interval);
    expect(checkInterval(i, { lo: -2, hi: 2, loClosed: false, hiClosed: false })).toBe(true);
    expect(checkInterval(i, { lo: -2, hi: 2, loClosed: true, hiClosed: false })).toBe(false);
    expect(checkInterval(i, { lo: -2, hi: 3, loClosed: false, hiClosed: false })).toBe(false);
    const ray = parseIntervalAnswer("[{{a}}, +inf)", { a: 3 });
    expect(ray).toEqual({ lo: 3, hi: null, loClosed: true, hiClosed: false });
    expect(formatInterval(ray)).toBe("$[3, +\\infty)$");
    expect(parseIntervalAnswer("(-∞, sqrt(2)]").hi).toBeCloseTo(Math.SQRT2);
  });

  it("expression: by value, in any form, and only in x", () => {
    const e = play(expression);
    const a = Number(/\((\d)\)/.exec(e.expression!)![1]);
    expect(checkExpression(e, `3x^2 + ${a}`)).toBe(true);
    expect(checkExpression(e, `${a} + 3x²`)).toBe(true);
    expect(checkExpression(e, `3xx + ${a}`)).toBe(true);
    expect(checkExpression(e, "3x^2")).toBe(false);
    expect(checkExpression(e, `3y^2 + ${a}`)).toBe(false);
    // A simplification counts: (x²−1)/(x−1) is x + 1 wherever it's defined.
    const simplify = instantiate({ type: "expression", prompt: "Απλοποίησε", answer: "x + 1" });
    expect(checkExpression(simplify, "(x^2 - 1)/(x - 1)")).toBe(true);
    expect(checkExpression(simplify, "x - 1")).toBe(false);
  });

  it("reads typed exact values: fractions, roots, π", () => {
    expect(parseTypedValue("3/4")).toBe(0.75);
    expect(parseTypedValue("√2")).toBeCloseTo(Math.SQRT2);
    expect(parseTypedValue("2π")).toBeCloseTo(2 * Math.PI);
    expect(parseTypedValue("-√3/2")).toBeCloseTo(-Math.sqrt(3) / 2);
    expect(parseTypedValue("7,5")).toBe(7.5);
    expect(parseTypedValue("x")).toBeNull();
    expect(parseTypedValue("")).toBeNull();
  });

  it("reads what students type into expressions", () => {
    expect(normalizeTyped("x²+3x", ["x"]).replace(/\s+/g, "")).toBe("x^2+3x");
    expect(parseTypedExpression("sinx")).not.toBeNull();
    expect(parseTypedExpression("√(x+1)")).not.toBeNull();
    expect(parseTypedExpression("2(x+")).toBeNull();
    expect(exprToTex("(-3) x + (-2)")).toBe("-3x - 2");
    expect(exprToTex("(x+1)/(x-1)")).toBe("\\frac{x + 1}{x - 1}");
    expect(exprToTex("2x^2 + sqrt(x)")).toBe("2x^{2} + \\sqrt{x}");
  });
});

describe("storing", () => {
  it("keeps only what each type needs", () => {
    expect(toPracticeQuestionColumns(multi)).toMatchObject({ answer: null, options: [{ correct: true }, { correct: false }, { correct: true }, { correct: false }] });
    expect(toPracticeQuestionColumns(order)).toMatchObject({ answer: null, options: [{ text: "$-2$", correct: false }, {}, {}] });
    expect(toPracticeQuestionColumns(match).options![0]).toEqual({ text: "$x^2$", correct: false, match: "$2x$" });
    expect(toPracticeQuestionColumns(signs)).toMatchObject({ answer: "$f'(x)$ | + - +", options: [{ text: "-1" }, { text: "1" }] });
    expect(toPracticeQuestionColumns(interval)).toMatchObject({ answer: "(-2, 2)", options: null, tolerance: null });
    expect(toPracticeQuestionColumns(expression)).toMatchObject({ answer: "3x^2 + a", options: null, variables: "a=2..5" });
  });

  it("tells matching questions apart by their right sides", () => {
    const swapped = { ...match, options: match.options!.map((option, i) => (i === 0 ? { ...option, match: "$x$" } : option)) };
    expect(practiceQuestionKey(swapped)).not.toBe(practiceQuestionKey(match));
  });

  it("validates a sign table with no roots and template roots", () => {
    expect(validatePracticeQuestion({ type: "sign_table", prompt: "Πρόσημο της $x^2 + 1$", options: [], answer: "+" })).toEqual([]);
    expect(
      validatePracticeQuestion({
        type: "sign_table", prompt: "Πρόσημο", options: [{ text: "{{r}}", correct: false }], answer: "- +", variables: "r=-3..3",
      }),
    ).toEqual([]);
  });
});
