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
