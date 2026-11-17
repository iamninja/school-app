// A small, safe arithmetic expression evaluator for practice questions:
// template variables ("c = a*x + b"), computed answers, conditions
// ("a != 0 and b > 0") and graph plots ("x^2 - 4x + 3"). No eval, no
// property access - only numbers, named variables, the operators below and
// a fixed list of functions. Pure; tests in tests/practice-expr.test.ts.
//
//   + - * / ^ (power), unary -, parentheses
//   == != < <= > >=  and  or  not   (true = 1, false = 0)
//   implicit multiplication: 2x, 3(x+1), 2pi, (x+1)(x-1)
//   sqrt abs round(x[,d]) floor ceil min max mod gcd lcm
//   sin cos tan (radians), sind cosd tand (degrees), ln log log2 exp
//   constants pi, e

export class PracticeExprError extends Error {}

type Token =
  | { kind: "num"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string };

const OPERATORS = ["==", "!=", "<=", ">=", "&&", "||", "+", "-", "*", "/", "^", "(", ")", ",", "<", ">", "!"];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const text = source.replace(/[−–]/g, "-").replace(/[·×]/g, "*").replace(/÷/g, "/");
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      const match = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(text.slice(i));
      if (!match) throw new PracticeExprError(`Unexpected "${ch}"`);
      tokens.push({ kind: "num", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }
    if (/[A-Za-zα-ωΑ-Ω_]/.test(ch)) {
      const match = /^[A-Za-zα-ωΑ-Ω_][A-Za-zα-ωΑ-Ω_0-9]*/.exec(text.slice(i))!;
      tokens.push({ kind: "name", value: match[0] });
      i += match[0].length;
      continue;
    }
    const op = OPERATORS.find((candidate) => text.startsWith(candidate, i));
    if (!op) throw new PracticeExprError(`Unexpected "${ch}"`);
    tokens.push({ kind: "op", value: op });
    i += op.length;
  }
  return tokens;
}

type Node =
  | { t: "num"; v: number }
  | { t: "var"; name: string }
  | { t: "un"; op: string; a: Node }
  | { t: "bin"; op: string; a: Node; b: Node }
  | { t: "call"; fn: string; args: Node[] };

const FUNCTIONS: Record<string, { arity: [number, number]; fn: (...args: number[]) => number }> = {
  sqrt: { arity: [1, 1], fn: Math.sqrt },
  abs: { arity: [1, 1], fn: Math.abs },
  round: {
    arity: [1, 2],
    fn: (x, d = 0) => {
      const factor = 10 ** d;
      return Math.round(x * factor) / factor;
    },
  },
  floor: { arity: [1, 1], fn: Math.floor },
  ceil: { arity: [1, 1], fn: Math.ceil },
  min: { arity: [1, 20], fn: Math.min },
  max: { arity: [1, 20], fn: Math.max },
  mod: { arity: [2, 2], fn: (a, b) => ((a % b) + b) % b },
  gcd: { arity: [2, 2], fn: gcd },
  lcm: { arity: [2, 2], fn: (a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd(a, b)) },
  sin: { arity: [1, 1], fn: Math.sin },
  cos: { arity: [1, 1], fn: Math.cos },
  tan: { arity: [1, 1], fn: Math.tan },
  sind: { arity: [1, 1], fn: (x) => cleanTrig(Math.sin((x * Math.PI) / 180)) },
  cosd: { arity: [1, 1], fn: (x) => cleanTrig(Math.cos((x * Math.PI) / 180)) },
  tand: { arity: [1, 1], fn: (x) => cleanTrig(Math.tan((x * Math.PI) / 180)) },
  ln: { arity: [1, 1], fn: Math.log },
  log: { arity: [1, 1], fn: Math.log10 },
  log2: { arity: [1, 1], fn: Math.log2 },
  exp: { arity: [1, 1], fn: Math.exp },
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E, π: Math.PI };

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

// sin 30° is 0.49999999999999994 in floating point; school answers expect 0.5.
function cleanTrig(value: number): number {
  const rounded = Math.round(value * 1e12) / 1e12;
  return Object.is(rounded, -0) ? 0 : rounded;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  parse(): Node {
    const node = this.or();
    if (this.pos < this.tokens.length) {
      throw new PracticeExprError(`Unexpected "${this.describe(this.tokens[this.pos])}"`);
    }
    return node;
  }

  private describe(token: Token): string {
    return String(token.value);
  }
  private peekOp(...ops: string[]): string | null {
    const token = this.tokens[this.pos];
    if (token?.kind === "op" && ops.includes(token.value)) return token.value;
    if (token?.kind === "name" && ops.includes(token.value.toLowerCase())) return token.value.toLowerCase();
    return null;
  }
  private expectOp(op: string) {
    if (!this.peekOp(op)) throw new PracticeExprError(`Expected "${op}"`);
    this.pos++;
  }

  private or(): Node {
    let node = this.and();
    for (let op = this.peekOp("or", "||"); op; op = this.peekOp("or", "||")) {
      this.pos++;
      node = { t: "bin", op: "or", a: node, b: this.and() };
    }
    return node;
  }
  private and(): Node {
    let node = this.not();
    for (let op = this.peekOp("and", "&&"); op; op = this.peekOp("and", "&&")) {
      this.pos++;
      node = { t: "bin", op: "and", a: node, b: this.not() };
    }
    return node;
  }
  private not(): Node {
    if (this.peekOp("not", "!")) {
      this.pos++;
      return { t: "un", op: "not", a: this.not() };
    }
    return this.compare();
  }
  private compare(): Node {
    let node = this.additive();
    for (let op = this.peekOp("==", "!=", "<", "<=", ">", ">="); op; op = this.peekOp("==", "!=", "<", "<=", ">", ">=")) {
      this.pos++;
      node = { t: "bin", op, a: node, b: this.additive() };
    }
    return node;
  }
  private additive(): Node {
    let node = this.term();
    for (let op = this.peekOp("+", "-"); op; op = this.peekOp("+", "-")) {
      this.pos++;
      node = { t: "bin", op, a: node, b: this.term() };
    }
    return node;
  }
  private term(): Node {
    let node = this.unary();
    for (;;) {
      const op = this.peekOp("*", "/");
      if (op) {
        this.pos++;
        node = { t: "bin", op, a: node, b: this.unary() };
        continue;
      }
      // Implicit multiplication: 2x, 3(x+1), (x+1)(x-1), 2pi - but never
      // before a keyword like "and".
      const next = this.tokens[this.pos];
      const startsFactor =
        (next?.kind === "name" && !["and", "or", "not"].includes(next.value.toLowerCase())) ||
        (next?.kind === "op" && next.value === "(") ||
        next?.kind === "num";
      if (startsFactor) {
        node = { t: "bin", op: "*", a: node, b: this.power() };
        continue;
      }
      return node;
    }
  }
  private unary(): Node {
    const op = this.peekOp("-", "+");
    if (op) {
      this.pos++;
      const a = this.unary();
      return op === "-" ? { t: "un", op: "neg", a } : a;
    }
    return this.power();
  }
  private power(): Node {
    const base = this.atom();
    if (this.peekOp("^")) {
      this.pos++;
      // Right-associative, and -x^2 means -(x^2): the exponent may carry a sign.
      return { t: "bin", op: "^", a: base, b: this.unary() };
    }
    return base;
  }
  private atom(): Node {
    const token = this.tokens[this.pos];
    if (!token) throw new PracticeExprError("The expression ends too early");
    if (token.kind === "num") {
      this.pos++;
      return { t: "num", v: token.value };
    }
    if (token.kind === "op" && token.value === "(") {
      this.pos++;
      const inner = this.or();
      this.expectOp(")");
      return inner;
    }
    if (token.kind === "name") {
      this.pos++;
      const lower = token.value.toLowerCase();
      if (Object.hasOwn(FUNCTIONS, lower) && this.peekOp("(")) {
        this.pos++;
        const args: Node[] = [];
        if (!this.peekOp(")")) {
          args.push(this.or());
          while (this.peekOp(",")) {
            this.pos++;
            args.push(this.or());
          }
        }
        this.expectOp(")");
        const [minArgs, maxArgs] = FUNCTIONS[lower].arity;
        if (args.length < minArgs || args.length > maxArgs) {
          throw new PracticeExprError(`${lower}() takes ${minArgs === maxArgs ? minArgs : `${minArgs}-${maxArgs}`} value(s)`);
        }
        return { t: "call", fn: lower, args };
      }
      return { t: "var", name: token.value };
    }
    throw new PracticeExprError(`Unexpected "${token.value}"`);
  }
}

const cache = new Map<string, Node>();

/** Parses an expression (cached). Throws PracticeExprError on bad syntax. */
export function parseExpr(source: string): Node {
  const cached = cache.get(source);
  if (cached) return cached;
  const trimmed = source.trim();
  if (!trimmed) throw new PracticeExprError("Empty expression");
  const node = new Parser(tokenize(trimmed)).parse();
  if (cache.size > 2000) cache.clear();
  cache.set(source, node);
  return node;
}

/** The variable names an expression uses (functions and constants excluded). */
export function exprVariables(source: string): string[] {
  const names = new Set<string>();
  const walk = (node: Node) => {
    if (node.t === "var") {
      if (!Object.hasOwn(CONSTANTS, node.name.toLowerCase())) names.add(node.name);
    } else if (node.t === "un") walk(node.a);
    else if (node.t === "bin") {
      walk(node.a);
      walk(node.b);
    } else if (node.t === "call") node.args.forEach(walk);
  };
  walk(parseExpr(source));
  return [...names];
}

function run(node: Node, scope: Record<string, number>): number {
  switch (node.t) {
    case "num":
      return node.v;
    case "var": {
      // Own properties only: "constructor" must not reach Object.prototype.
      if (Object.hasOwn(scope, node.name)) return scope[node.name];
      if (Object.hasOwn(CONSTANTS, node.name.toLowerCase())) return CONSTANTS[node.name.toLowerCase()];
      throw new PracticeExprError(`Unknown name "${node.name}"`);
    }
    case "un": {
      const a = run(node.a, scope);
      return node.op === "neg" ? -a : a ? 0 : 1;
    }
    case "bin": {
      if (node.op === "and") return run(node.a, scope) && run(node.b, scope) ? 1 : 0;
      if (node.op === "or") return run(node.a, scope) || run(node.b, scope) ? 1 : 0;
      const a = run(node.a, scope);
      const b = run(node.b, scope);
      switch (node.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "^": return a ** b;
        case "==": return Math.abs(a - b) < 1e-9 ? 1 : 0;
        case "!=": return Math.abs(a - b) < 1e-9 ? 0 : 1;
        case "<": return a < b ? 1 : 0;
        case "<=": return a <= b + 1e-9 ? 1 : 0;
        case ">": return a > b ? 1 : 0;
        case ">=": return a >= b - 1e-9 ? 1 : 0;
      }
      throw new PracticeExprError(`Unknown operator "${node.op}"`);
    }
    case "call":
      return FUNCTIONS[node.fn].fn(...node.args.map((arg) => run(arg, scope)));
  }
}

/**
 * Evaluates an expression with the given variables. Throws on a syntax
 * error or an unknown name; returns NaN/Infinity as computed (callers
 * reject non-finite results where it matters).
 */
export function evalExpr(source: string, scope: Record<string, number> = {}): number {
  return run(parseExpr(source), scope);
}

const TEX_FUNCTIONS: Record<string, string> = {
  sin: "\\sin", cos: "\\cos", tan: "\\tan", ln: "\\ln", log: "\\log",
};

/**
 * An expression as LaTeX, for showing what a student typed ("2x^2 + sqrt(x)"
 * -> "2x^{2} + \\sqrt{x}"). Throws PracticeExprError on bad syntax.
 */
export function exprToTex(source: string): string {
  const num = (value: number) => {
    const text = String(Math.round(value * 1e9) / 1e9);
    return text.replace(".", "{,}");
  };
  const prec = (node: Node): number => {
    if (node.t === "bin") return node.op === "+" || node.op === "-" ? 1 : node.op === "*" || node.op === "/" ? 2 : node.op === "^" ? 4 : 0;
    if (node.t === "un") return node.op === "neg" ? 1.5 : 0;
    return 5;
  };
  const wrap = (tex: string) => `\\left(${tex}\\right)`;
  const tex = (node: Node): string => {
    switch (node.t) {
      case "num":
        return num(node.v);
      case "var": {
        const lower = node.name.toLowerCase();
        return lower === "pi" || node.name === "π" ? "\\pi" : node.name.length > 1 ? `\\mathrm{${node.name}}` : node.name;
      }
      case "un":
        if (node.op === "neg") return `-${prec(node.a) <= 1.5 ? wrap(tex(node.a)) : tex(node.a)}`;
        return `\\neg ${tex(node.a)}`;
      case "call": {
        const args = node.args.map(tex);
        if (node.fn === "sqrt") return `\\sqrt{${args[0]}}`;
        if (node.fn === "abs") return `\\left|${args[0]}\\right|`;
        if (node.fn === "exp") return `e^{${args[0]}}`;
        const name = TEX_FUNCTIONS[node.fn] ?? `\\operatorname{${node.fn}}`;
        return `${name}${wrap(args.join(", "))}`;
      }
      case "bin": {
        // Filled-in negatives read naturally: a + (-b) -> a - b, a - (-b) -> a + b, (-3)x -> -3x.
        if ((node.op === "+" || node.op === "-") && node.b.t === "un" && node.b.op === "neg") {
          return tex({ t: "bin", op: node.op === "+" ? "-" : "+", a: node.a, b: node.b.a });
        }
        if (node.op === "*" && node.a.t === "un" && node.a.op === "neg") {
          return tex({ t: "un", op: "neg", a: { t: "bin", op: "*", a: node.a.a, b: node.b } });
        }
        if (node.op === "*" && node.a.t === "num" && node.a.v === 1) return tex(node.b);
        if ((node.op === "+" || node.op === "-") && node.b.t === "num" && node.b.v < 0) {
          return tex({ t: "bin", op: node.op === "+" ? "-" : "+", a: node.a, b: { t: "num", v: -node.b.v } });
        }
        const p = prec(node);
        if (node.op === "/") return `\\frac{${tex(node.a)}}{${tex(node.b)}}`;
        if (node.op === "^") {
          const base = prec(node.a) < 5 || (node.a.t === "num" && node.a.v < 0) || node.a.t === "call" ? wrap(tex(node.a)) : tex(node.a);
          return `${base}^{${tex(node.b)}}`;
        }
        const left = prec(node.a) < p ? wrap(tex(node.a)) : tex(node.a);
        const rightNeedsParens = prec(node.b) < p || (node.op === "-" && prec(node.b) === p) || (prec(node.b) === 1.5 && (node.op === "+" || node.op === "-" || node.op === "*"));
        const right = rightNeedsParens ? wrap(tex(node.b)) : tex(node.b);
        if (node.op === "*") {
          // 2x, 3\sqrt{x}, 2(x+1) - a number times something that starts with a letter or a bracket.
          const juxtapose = node.a.t === "num" && !/^[\d{-]/.test(right.replace(/^\\left/, "("));
          return juxtapose ? `${left}${right}` : `${left} \\cdot ${right}`;
        }
        const ops: Record<string, string> = { "+": "+", "-": "-", "==": "=", "!=": "\\neq", "<": "<", "<=": "\\le", ">": ">", ">=": "\\ge", and: "\\wedge", or: "\\vee" };
        return `${left} ${ops[node.op] ?? node.op} ${right}`;
      }
    }
  };
  return tex(parseExpr(source));
}

const TYPED_NAMES = ["sqrt", "abs", "ln", "log", "exp", "sin", "cos", "tan", "pi", "e"];

/**
 * What a student typed, made readable for the parser: √ -> sqrt, π -> pi,
 * x² -> x^2, a decimal comma -> point, and runs of letters split into known
 * names ("xsqrt(x)" -> "x sqrt(x)", "xx" -> "x x"). `variables` are the
 * one-letter names allowed (usually x).
 */
export function normalizeTyped(raw: string, variables: string[] = []): string {
  let text = raw
    .replace(/[−–]/g, "-")
    .replace(/[·×]/g, "*")
    .replace(/÷/g, "/")
    .replace(/²/g, "^2")
    .replace(/³/g, "^3")
    .replace(/π/g, " pi ")
    .replace(/(\d),(\d)/g, "$1.$2");
  // √x, √(x+1), √2 -> sqrt(...)
  text = text.replace(/√\s*(\((?:[^()]|\([^()]*\))*\)|[A-Za-z0-9.]+)/g, (_, arg: string) => (arg.startsWith("(") ? `sqrt${arg}` : `sqrt(${arg})`));
  const names = [...TYPED_NAMES, ...variables].sort((a, b) => b.length - a.length);
  text = text.replace(/[A-Za-z]+/g, (run) => {
    const parts: string[] = [];
    let i = 0;
    while (i < run.length) {
      const name = names.find((candidate) => run.toLowerCase().startsWith(candidate.toLowerCase(), i));
      if (!name) return run; // unknown: leave it for the parser to name
      parts.push(run.slice(i, i + name.length));
      i += name.length;
    }
    return ` ${parts.join(" ")} `;
  });
  // "sin x", "ln 2" -> sin(x), ln(2): a function name needs its brackets.
  return text.replace(/\b(sqrt|abs|ln|log|exp|sin|cos|tan)\s+([A-Za-z]\b|\d+(?:\.\d+)?)(?!\s*[(^])/g, "$1($2)");
}
