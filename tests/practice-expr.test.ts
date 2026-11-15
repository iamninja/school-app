import { describe, expect, it } from "vitest";

import { evalExpr, exprVariables, PracticeExprError } from "@/lib/practice-expr";

describe("evalExpr", () => {
  it("does arithmetic with the usual precedence", () => {
    expect(evalExpr("2 + 3 * 4")).toBe(14);
    expect(evalExpr("(2 + 3) * 4")).toBe(20);
    expect(evalExpr("2^3^2")).toBe(512);
    expect(evalExpr("-x^2", { x: 3 })).toBe(-9);
    expect(evalExpr("2^-1")).toBe(0.5);
    expect(evalExpr("7 / 2")).toBe(3.5);
  });

  it("multiplies implicitly", () => {
    expect(evalExpr("2x + 1", { x: 4 })).toBe(9);
    expect(evalExpr("3(x+1)", { x: 1 })).toBe(6);
    expect(evalExpr("(x+1)(x-1)", { x: 3 })).toBe(8);
    expect(evalExpr("2pi")).toBeCloseTo(2 * Math.PI);
  });

  it("knows the school functions, trig in degrees exactly", () => {
    expect(evalExpr("sqrt(49)")).toBe(7);
    expect(evalExpr("round(sqrt(50), 2)")).toBe(7.07);
    expect(evalExpr("sind(30)")).toBe(0.5);
    expect(evalExpr("cosd(60)")).toBe(0.5);
    expect(evalExpr("log(1000)")).toBeCloseTo(3);
    expect(evalExpr("log2(32)")).toBe(5);
    expect(evalExpr("gcd(12, 18)")).toBe(6);
    expect(evalExpr("lcm(4, 6)")).toBe(12);
    expect(evalExpr("max(1, 7, 3)")).toBe(7);
    expect(evalExpr("mod(-1, 5)")).toBe(4);
  });

  it("compares and combines conditions", () => {
    expect(evalExpr("a != 0 and b > a", { a: 1, b: 2 })).toBe(1);
    expect(evalExpr("a == 0 or not (b < 3)", { a: 1, b: 2 })).toBe(0);
    expect(evalExpr("0.1 + 0.2 == 0.3")).toBe(1);
  });

  it("accepts Greek-keyboard symbols", () => {
    expect(evalExpr("3 · 4 − 2")).toBe(10);
    expect(evalExpr("π")).toBeCloseTo(Math.PI);
  });

  it("refuses anything but maths", () => {
    expect(() => evalExpr("constructor")).toThrow(PracticeExprError);
    expect(() => evalExpr("a.b")).toThrow(PracticeExprError);
    expect(() => evalExpr("process['exit']()")).toThrow(PracticeExprError);
    expect(() => evalExpr("2 +")).toThrow(PracticeExprError);
    expect(() => evalExpr("sqrt(1, 2)")).toThrow(/takes 1/);
    expect(() => evalExpr("y + 1")).toThrow(/Unknown name "y"/);
  });

  it("lists the variables an expression uses", () => {
    expect(exprVariables("a*x + b - pi + sqrt(c)").sort()).toEqual(["a", "b", "c", "x"]);
  });
});
