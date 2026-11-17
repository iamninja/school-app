// Reads the simple LaTeX the teacher writes in counterexample options
// ("$f(x) = \frac{|x|}{x}$, στο $x_0 = 0$") as practice-expr expressions,
// so a counterexample the student types can be compared with them by value.
// Only the usual school forms are read; anything else gives null and the
// question simply stays multiple choice. Pure; tests in
// tests/practice-counterexample-v3.test.ts.

import { evalExpr, exprVariables, normalizeTyped } from "@/lib/practice-expr";

const FUNCTIONS: Record<string, string> = {
  ln: "ln", log: "log", sin: "sin", cos: "cos", tan: "tan", exp: "exp",
  ημ: "sin", συν: "cos", εφ: "tan",
};

/** The text inside a {...} group starting at `open` (the "{"), and the index after it. */
function group(text: string, open: number): [string, number] | null {
  if (text[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return [text.slice(open + 1, i), i + 1];
  }
  return null;
}

/** An argument: a {...} group, or a single character or command (x^2, \frac12). */
function argument(text: string, at: number): [string, number] | null {
  let i = at;
  while (text[i] === " ") i++;
  if (text[i] === "{") return group(text, i);
  if (text[i] === "\\") {
    const match = /^\\[A-Za-z]+/.exec(text.slice(i));
    return match ? [match[0], i + match[0].length] : null;
  }
  return i < text.length ? [text[i], i + 1] : null;
}

/** LaTeX -> expression text, or null for anything it doesn't know. */
export function latexToExpr(source: string): string | null {
  const text = source
    .replace(/\\left|\\right|\\[,;!]|\\displaystyle/g, "")
    .replace(/\\text\{\s*(ημ|συν|εφ)\s*\}/g, "\\$1")
    .replace(/\\(?:mathrm|operatorname)\{([A-Za-z]+)\}/g, "\\$1")
    .trim();
  let out = "";
  let i = 0;
  let absOpen = false;
  try {
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\") {
        const name = /^\\([A-Za-z]+|[α-ω]+)/.exec(text.slice(i));
        if (!name) return null;
        const command = name[1];
        i += name[0].length;
        if (command === "frac" || command === "dfrac" || command === "tfrac") {
          const a = argument(text, i);
          if (!a) return null;
          const b = argument(text, a[1]);
          if (!b) return null;
          const top = latexToExpr(a[0]);
          const bottom = latexToExpr(b[0]);
          if (top === null || bottom === null) return null;
          out += `((${top})/(${bottom}))`;
          i = b[1];
        } else if (command === "sqrt") {
          const a = argument(text, i);
          if (!a) return null;
          const inner = latexToExpr(a[0]);
          if (inner === null) return null;
          out += `sqrt(${inner})`;
          i = a[1];
        } else if (command === "cdot" || command === "times") out += "*";
        else if (command === "pi") out += " pi ";
        else if (Object.hasOwn(FUNCTIONS, command)) {
          // \ln x, \ln(x+1), \ln{x}: the argument may come without brackets.
          let j = i;
          while (text[j] === " ") j++;
          if (text[j] === "(") out += `${FUNCTIONS[command]}`;
          else {
            const a = argument(text, j);
            if (!a) return null;
            const inner = latexToExpr(a[0]);
            if (inner === null) return null;
            out += `${FUNCTIONS[command]}(${inner})`;
            i = a[1];
            continue;
          }
          i = j;
        } else return null;
        continue;
      }
      if (ch === "^") {
        const a = argument(text, i + 1);
        if (!a) return null;
        const inner = latexToExpr(a[0]);
        if (inner === null) return null;
        out += `^(${inner})`;
        i = a[1];
        continue;
      }
      if (ch === "{" || ch === "}") {
        out += ch === "{" ? "(" : ")";
        i++;
        continue;
      }
      if (ch === "|") {
        out += absOpen ? ")" : " abs(";
        absOpen = !absOpen;
        i++;
        continue;
      }
      if (/[A-Za-z0-9.+\-*/() ,]/.test(ch)) {
        out += ch === "," ? "." : ch;
        i++;
        continue;
      }
      return null;
    }
  } catch {
    return null;
  }
  if (absOpen) return null;
  // Split runs of letters into known names: "xe^x" -> "x e^x", "abs(" stays.
  const spaced = normalizeTyped(out, ["x"]).replace(/\s+/g, " ").trim();
  try {
    if (exprVariables(spaced).some((name) => name !== "x")) return null;
    evalExpr(spaced, { x: 0.37 });
    return spaced;
  } catch {
    return null;
  }
}

/** A counterexample option as a function of x, and its point when it names one. */
export interface TypedOption {
  expr: string;
  x0: number | null;
}

const OPTION = /^\$\s*f\s*\(\s*x\s*\)\s*=\s*(.+?)\s*\$\s*(?:,?\s*(?:στο|με|για)\s*\$\s*x_0\s*=\s*(.+?)\s*\$)?\s*\.?$/;

/**
 * "$f(x) = |x|$, στο $x_0 = 0$" -> { expr: "abs(x)", x0: 0 }. null for an
 * option that isn't a single formula of x (a piecewise function, a pair, words).
 */
export function readCounterexampleOption(text: string): TypedOption | null {
  const match = OPTION.exec(text.trim());
  if (!match) return null;
  const expr = latexToExpr(match[1]);
  if (expr === null) return null;
  let x0: number | null = null;
  if (match[2] !== undefined) {
    const point = latexToExpr(match[2]);
    if (point === null) return null;
    try {
      x0 = evalExpr(point);
    } catch {
      return null;
    }
    if (!Number.isFinite(x0)) return null;
  }
  return { expr, x0 };
}
