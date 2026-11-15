import { describe, expect, it } from "vitest";

import {
  drawValues,
  fillPlaceholders,
  formatNumber,
  instantiate,
  isCorrect,
  parseTypedNumber,
  parseVariables,
  PracticeTemplateError,
  seededRng,
  validatePracticeQuestion,
  type PracticeQuestionSpec,
} from "@/lib/practice-template";

describe("parseVariables", () => {
  it("reads ranges, steps, exclusions, lists and computed values", () => {
    const defs = parseVariables("a=2..9, p=0.5..2 step 0.5, b=-3..3 !0 !1, s=-1|1, c=a*x+b".replace("a*x+b", "a+b"));
    expect(defs.slice(0, 4)).toEqual([
      { name: "a", kind: "range", min: 2, max: 9, step: 1, exclude: [] },
      { name: "p", kind: "range", min: 0.5, max: 2, step: 0.5, exclude: [] },
      { name: "b", kind: "range", min: -3, max: 3, step: 1, exclude: [0, 1] },
      { name: "s", kind: "list", values: [-1, 1] },
    ]);
    expect(defs[4]).toEqual({ name: "c", kind: "expr", expr: "a+b" });
  });

  it("keeps commas inside function calls", () => {
    const defs = parseVariables("a=1..5, b=2..6, m=max(a, b)");
    expect(defs).toHaveLength(3);
    expect(defs[2]).toEqual({ name: "m", kind: "expr", expr: "max(a, b)" });
  });

  it("explains mistakes", () => {
    expect(() => parseVariables("c=a+1, a=1..3")).toThrow(/"a" isn't defined before it/);
    expect(() => parseVariables("a=9..2")).toThrow(/backwards/);
    expect(() => parseVariables("pi=1..3")).toThrow(/can't be a variable name/);
    expect(() => parseVariables("a=1..3, a=2..4")).toThrow(/defined twice/);
    expect(() => parseVariables("a 1..3")).toThrow(/name=values/);
  });
});

describe("drawValues", () => {
  it("draws within ranges, skips excluded values and meets the condition", () => {
    const defs = parseVariables("a=-3..3 !0, b=-3..3, c=a+b");
    const rng = seededRng(7);
    for (let i = 0; i < 200; i++) {
      const v = drawValues(defs, "b != a", rng);
      expect(v.a).not.toBe(0);
      expect(v.a).toBeGreaterThanOrEqual(-3);
      expect(v.a).toBeLessThanOrEqual(3);
      expect(v.b).not.toBe(v.a);
      expect(v.c).toBe(v.a + v.b);
    }
  });

  it("gives up on an impossible condition", () => {
    expect(() => drawValues(parseVariables("a=1..3"), "a > 5", seededRng(1), 50)).toThrow(PracticeTemplateError);
  });
});

describe("fillPlaceholders / formatNumber", () => {
  it("writes decimals the Greek way, LaTeX-safe inside $...$", () => {
    expect(formatNumber(7.5, false)).toBe("7,5");
    expect(formatNumber(7.5, true)).toBe("7{,}5");
    expect(formatNumber(-3, false)).toBe("−3");
    expect(formatNumber(-3, true)).toBe("-3");
    expect(formatNumber(1 / 3, false)).toBe("0,3333");
  });

  it("fills values and signed values", () => {
    expect(fillPlaceholders("Λύσε ${{a}}x {{+b}} = {{c}}$, με a = {{a}}", { a: 2, b: -3, c: 7 })).toBe(
      "Λύσε $2x - 3 = 7$, με a = 2",
    );
    expect(fillPlaceholders("$x {{+b}}$ και x {{+b}}", { b: 4 })).toBe("$x + 4$ και x + 4");
    expect(fillPlaceholders("$\\frac{ {{a}} }{2}$ = {{a/2}}", { a: 5 })).toBe("$\\frac{ 5 }{2}$ = 2,5");
  });
});

const solveLinear: PracticeQuestionSpec = {
  type: "number",
  prompt: "Λύσε ${{a}}x {{+b}} = {{c}}$.",
  answer: "x",
  variables: "a=2..9, x=-10..10, b=-20..20 !0, c=a*x+b",
  explanation: "${{a}}x = {{c-b}}$, άρα $x = {{x}}$.",
};

describe("instantiate", () => {
  it("plays a template as a concrete question whose answer matches the numbers", () => {
    const rng = seededRng(42);
    for (let i = 0; i < 50; i++) {
      const q = instantiate(solveLinear, rng);
      const m = /^Λύσε \$(-?\d+)x ([+-]) (\d+) = (-?\d+)\$\.$/.exec(q.prompt);
      expect(m).not.toBeNull();
      const [a, sign, b, c] = [Number(m![1]), m![2], Number(m![3]), Number(m![4])];
      expect(a * q.answer + (sign === "+" ? b : -b)).toBe(c);
      expect(q.explanation).toContain(`$x = ${q.answer < 0 ? "-" : ""}${Math.abs(q.answer)}$`);
    }
  });

  it("plays plain questions of every type", () => {
    expect(instantiate({ type: "true_false", prompt: "Το 7 είναι πρώτος.", answer: "Σωστό" }).answer).toBe(1);
    expect(instantiate({ type: "true_false", prompt: "x", answer: "false" }).answer).toBe(0);
    const choice = instantiate({
      type: "choice",
      prompt: "Κλίση της $y = 3x - 2$;",
      options: [
        { text: "$3$", correct: true },
        { text: "$-2$", correct: false },
      ],
    });
    expect(choice.options).toHaveLength(2);
    const slider = instantiate({ type: "slider", prompt: "√50", answer: "sqrt(50)", sliderMin: 0, sliderMax: 10 });
    expect(slider.answer).toBeCloseTo(7.0711, 3);
    expect(slider.tolerance).toBe(0.25);
    expect(slider.slider).toEqual({ min: 0, max: 10, step: 0.1 });
    const point = instantiate({
      type: "point",
      prompt: "Κορυφή",
      answer: "(k, l)",
      variables: "k=-3..3, l=-3..3",
      graph: { xMin: -5, xMax: 5, yMin: -5, yMax: 10, plots: ["(x - k)^2 + l"] },
    }, seededRng(3));
    expect(point.graph!.plots[0]).toMatch(/^\(x - \(-?\d\)\)\^2 \+ \(-?\d\)$/);
    expect(point.tolerance).toBe(0.25);
  });

  it("rejects options that come out the same", () => {
    expect(() =>
      instantiate({
        type: "choice",
        prompt: "?",
        variables: "a=1..1",
        options: [
          { text: "{{a}}", correct: true },
          { text: "{{a*a}}", correct: false },
        ],
      }),
    ).toThrow(/came out the same/);
  });
});

describe("validatePracticeQuestion", () => {
  it("passes a good template", () => {
    expect(validatePracticeQuestion(solveLinear)).toEqual([]);
  });

  it("collects every problem", () => {
    expect(validatePracticeQuestion({ type: "number", prompt: " ", answer: "" })).toEqual([
      "Write the question",
      "A number question needs an answer",
    ]);
    expect(validatePracticeQuestion({ type: "number", prompt: "√2;", answer: "sqrt(2)" })[0]).toMatch(/round it/);
    expect(validatePracticeQuestion({ type: "number", prompt: "√2;", answer: "sqrt(2)", tolerance: 0.01 })).toEqual([]);
    expect(
      validatePracticeQuestion({ type: "slider", prompt: "?", answer: "12", sliderMin: 0, sliderMax: 10 })[0],
    ).toMatch(/outside the slider/);
    expect(
      validatePracticeQuestion({
        type: "point",
        prompt: "?",
        answer: "(x, 1)",
        variables: "x=1..2",
        graph: { xMin: -5, xMax: 5, yMin: -5, yMax: 5, plots: ["x + 1"] },
      }),
    ).toContain("Plots use x for the axis - give the variable another name");
  });
});

describe("isCorrect / parseTypedNumber", () => {
  it("checks every type, with tolerance", () => {
    const num = instantiate({ type: "number", prompt: "?", answer: "7.07", tolerance: 0.01 });
    expect(isCorrect(num, 7.075)).toBe(true);
    expect(isCorrect(num, 7.09)).toBe(false);
    const point = instantiate({ type: "point", prompt: "?", answer: "(2, 1)", graph: { xMin: -1, xMax: 5, yMin: -1, yMax: 5, plots: [] } });
    expect(isCorrect(point, { x: 2, y: 1.25 })).toBe(true);
    expect(isCorrect(point, { x: 2.5, y: 1 })).toBe(false);
    const tf = instantiate({ type: "true_false", prompt: "?", answer: "true" });
    expect(isCorrect(tf, 1)).toBe(true);
  });

  it("reads Greek and English decimals and simple fractions", () => {
    expect(parseTypedNumber("7,5")).toBe(7.5);
    expect(parseTypedNumber(" −3 ")).toBe(-3);
    expect(parseTypedNumber("1/4")).toBe(0.25);
    expect(parseTypedNumber("abc")).toBeNull();
    expect(parseTypedNumber("")).toBeNull();
    expect(parseTypedNumber("1/0")).toBeNull();
  });
});
