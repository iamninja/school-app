// A subset of TikZ, read into simple shapes the app draws as SVG
// (components/practice/practice-figure.tsx). The teacher draws every book
// figure in TikZ, so practice questions take it as written. What isn't in
// the subset is reported by name - never drawn wrong silently.
//
// Supported:
//   \begin{tikzpicture}[scale=..] ... \end{tikzpicture} (optional)
//   \coordinate (A) at (x,y);           (x,y)  (A)  (30:2)  ++(1,0)  +(1,0)
//                                       ($(A)!0.5!(B)$)  ($(A)+(1,2)$)  ($0.5*(A)+0.5*(B)$)
//   \draw / \fill / \filldraw / \path [options] path;
//       --  -- cycle  |-  -|  to  circle (r)  circle[radius=r]  arc (a:b:r)
//       arc[start angle=a, end angle=b, radius=r]  rectangle (p)  grid (p)
//       node[opts]{text}  coordinate (name)
//   \node[opts] (name) at (p) {text};   \node at (p) [opts] {text};
//   \pic[draw, "$\omega$", angle radius=.., angle eccentricity=..] {angle = B--A--C};
//   \pic[draw] {right angle = B--A--C};
// Options: colours (red, blue!30, draw=, fill=), fill opacity, opacity,
// thin/thick/very thick/ultra thick/line width, dashed/dotted, help lines,
// arrows (->, <-, <->, -latex, -stealth, -{Latex}), node placement (above,
// below left, anchor=, midway, pos=, near start/end). Lengths in cm (the
// TikZ default), mm or pt. Inside {...} coordinates sin/cos/tan take
// degrees, as in TikZ. Pure; tests in tests/practice-tikz.test.ts.

import { evalExpr } from "@/lib/practice-expr";

export interface Pt {
  x: number;
  y: number;
}

export type FigureColor =
  | "black" | "red" | "blue" | "green" | "orange" | "purple" | "gray" | "brown" | "cyan" | "magenta" | "teal" | "violet" | "yellow" | "white";

export interface FigureStyle {
  stroke: FigureColor | null;
  fill: FigureColor | null;
  /** 0..1 */
  fillOpacity: number;
  /** 0..1: a tint like `gray!40` on a line (on the white page, tint = opacity). */
  strokeOpacity: number;
  opacity: number;
  /** In px at the figure's size: thin 1, normal 1.6, thick 2.4, very thick 3.2, ultra thick 4. */
  width: number;
  dash: "dashed" | "dotted" | null;
  arrowStart: boolean;
  arrowEnd: boolean;
}

export type LabelPlace =
  | "center" | "above" | "below" | "left" | "right" | "above left" | "above right" | "below left" | "below right";

export type FigureShape =
  | { kind: "path"; points: Pt[]; closed: boolean; style: FigureStyle }
  | { kind: "circle"; center: Pt; r: number; style: FigureStyle }
  | { kind: "arc"; center: Pt; r: number; start: number; end: number; style: FigureStyle }
  | { kind: "grid"; from: Pt; to: Pt; step: number; style: FigureStyle }
  | { kind: "label"; at: Pt; text: string; place: LabelPlace; color: FigureColor | null }
  | { kind: "angle"; vertex: Pt; from: Pt; to: Pt; radius: number; right: boolean; label: string | null; eccentricity: number; style: FigureStyle };

export interface Figure {
  shapes: FigureShape[];
}

export class TikzError extends Error {}

const COLORS: FigureColor[] = ["black", "red", "blue", "green", "orange", "purple", "gray", "brown", "cyan", "magenta", "teal", "violet", "yellow", "white"];
const COLOR_ALIASES: Record<string, FigureColor> = { darkgray: "gray", lightgray: "gray", grey: "gray", lime: "green", olive: "green", pink: "magenta" };

const PT_PER_CM = 28.4527559;

/** "2", "2cm", "5mm", "3pt", "{2*cos(30)}" -> cm. */
function length(raw: string, vars: Record<string, number> = {}): number {
  const text = raw.trim().replace(/^\{|\}$/g, "").trim();
  const unit = /^(.*?)\s*(cm|mm|pt|em|ex)$/.exec(text);
  const body = unit ? unit[1] : text;
  const value = number(body, vars);
  if (!unit) return value;
  return unit[2] === "mm" ? value / 10 : unit[2] === "pt" ? value / PT_PER_CM : unit[2] === "cm" ? value : (value * 10) / PT_PER_CM;
}

/** A length in the picture: plain numbers follow the picture's scale, lengths with units (2pt, 5mm) don't - as in TikZ. */
function scaledLength(raw: string, state: { scale: number; vars: Record<string, number> }): number {
  const hasUnit = /(cm|mm|pt|em|ex)\s*\}?\s*$/.test(raw.trim());
  return length(raw, state.vars) * (hasUnit ? 1 : state.scale);
}

/** A TikZ number expression: plain, or with sin/cos/tan in degrees, sqrt, pi... */
function number(raw: string, vars: Record<string, number> = {}): number {
  const text = raw.trim().replace(/^\{|\}$/g, "").replace(/\\/g, "").trim();
  if (!text) throw new TikzError("A number is missing");
  const expr = text.replace(/\b(sin|cos|tan)\s*\(/g, "$1d(").replace(/\bdeg\s*\(/g, "(180/pi)*(");
  let value: number;
  try {
    value = evalExpr(expr, vars);
  } catch {
    throw new TikzError(`Can't read the number "${raw.trim()}"`);
  }
  if (!Number.isFinite(value)) throw new TikzError(`"${raw.trim()}" has no value`);
  return value;
}

/** Splits at a separator outside (), {}, [] and $...$. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inMath = false;
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "$" && text[i - 1] !== "\\") inMath = !inMath;
    if (!inMath && "({[".includes(ch)) depth++;
    if (!inMath && ")}]".includes(ch)) depth--;
    if (!inMath && depth === 0 && text.startsWith(separator, i)) {
      parts.push(current);
      current = "";
      i += separator.length - 1;
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** The text of a bracketed group starting at `open`, and the index after it. */
function group(text: string, open: number, pair: "()" | "[]" | "{}"): [string, number] {
  let depth = 0;
  let inMath = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "$" && text[i - 1] !== "\\" && pair !== "{}") inMath = !inMath;
    if (inMath) continue;
    if (ch === pair[0]) depth++;
    else if (ch === pair[1] && --depth === 0) return [text.slice(open + 1, i), i + 1];
  }
  throw new TikzError(`A "${pair[0]}" isn't closed`);
}

// ------------------------------------------------------------ options

interface Options {
  style: Partial<FigureStyle>;
  place: LabelPlace | null;
  pos: number | null;
  color: FigureColor | null;
  /** The `!NN` of a bare colour key (`\fill[teal!25]`), 0..1. */
  colorAmount: number;
  stepGrid: number | null;
  radius: number | null;
  startAngle: number | null;
  endAngle: number | null;
  angleRadius: number | null;
  eccentricity: number | null;
  quote: string | null;
  scale: number | null;
}

function color(raw: string): { color: FigureColor; amount: number } | null {
  const [base, mix] = raw.trim().toLowerCase().split("!");
  const name = COLOR_ALIASES[base] ?? (COLORS.includes(base as FigureColor) ? (base as FigureColor) : null);
  if (!name) return null;
  const amount = mix !== undefined && /^\d+$/.test(mix) ? Math.min(100, Number(mix)) / 100 : 1;
  return { color: name, amount };
}

const PLACES: LabelPlace[] = ["above left", "above right", "below left", "below right", "above", "below", "left", "right"];
const ANCHOR_TO_PLACE: Record<string, LabelPlace> = {
  south: "above", north: "below", east: "left", west: "right",
  "south east": "above left", "south west": "above right", "north east": "below left", "north west": "below right", center: "center",
};

function parseOptions(raw: string): Options {
  const options: Options = {
    style: {}, place: null, pos: null, color: null, colorAmount: 1, stepGrid: null, radius: null,
    startAngle: null, endAngle: null, angleRadius: null, eccentricity: null, quote: null, scale: null,
  };
  for (const item of splitTop(raw, ",")) {
    const quoted = /^"(.*)"(.*)$/.exec(item);
    if (quoted) {
      options.quote = quoted[1];
      continue;
    }
    const eq = item.indexOf("=");
    const key = (eq >= 0 ? item.slice(0, eq) : item).trim().toLowerCase().replace(/\s+/g, " ");
    const value = eq >= 0 ? item.slice(eq + 1).trim() : "";
    const asColor = eq < 0 ? color(key) : null;
    if (asColor) {
      options.color = asColor.color;
      options.colorAmount = asColor.amount;
      options.style.stroke = asColor.color;
      if (asColor.amount < 1) options.style.strokeOpacity = asColor.amount;
      continue;
    }
    switch (key) {
      case "draw": {
        const c = value ? color(value) : { color: "black" as FigureColor, amount: 1 };
        if (c) {
          options.style.stroke = c.color;
          options.style.strokeOpacity = c.amount;
        }
        break;
      }
      case "fill": {
        const c = color(value);
        if (c) {
          options.style.fill = c.color;
          if (c.amount < 1) options.style.fillOpacity = c.amount;
        }
        break;
      }
      case "color":
      case "text": {
        const c = color(value);
        if (c) {
          options.color = c.color;
          if (key === "color") options.style.stroke = c.color;
        }
        break;
      }
      case "fill opacity":
        options.style.fillOpacity = number(value);
        break;
      case "opacity":
      case "draw opacity":
        options.style.opacity = number(value);
        break;
      case "thin":
      case "very thin":
      case "ultra thin":
        options.style.width = 1;
        break;
      case "semithick":
        options.style.width = 2;
        break;
      case "thick":
        options.style.width = 2.4;
        break;
      case "very thick":
        options.style.width = 3.2;
        break;
      case "ultra thick":
        options.style.width = 4;
        break;
      case "line width":
        options.style.width = Math.max(0.5, Math.min(6, length(value) * PT_PER_CM * 2));
        break;
      case "dashed":
      case "densely dashed":
      case "loosely dashed":
        options.style.dash = "dashed";
        break;
      case "dotted":
      case "densely dotted":
      case "loosely dotted":
        options.style.dash = "dotted";
        break;
      case "help lines":
        options.style.stroke = "gray";
        options.style.width = 1;
        options.style.opacity = 0.5;
        break;
      case "midway":
        options.pos = 0.5;
        break;
      case "near start":
        options.pos = 0.25;
        break;
      case "near end":
        options.pos = 0.75;
        break;
      case "at start":
        options.pos = 0;
        break;
      case "at end":
        options.pos = 1;
        break;
      case "pos":
        options.pos = number(value);
        break;
      case "anchor":
        options.place = ANCHOR_TO_PLACE[value.toLowerCase()] ?? null;
        break;
      case "step":
        options.stepGrid = length(value);
        break;
      case "radius":
        options.radius = length(value);
        break;
      case "start angle":
        options.startAngle = number(value);
        break;
      case "end angle":
        options.endAngle = number(value);
        break;
      case "angle radius":
        options.angleRadius = length(value);
        break;
      case "angle eccentricity":
        options.eccentricity = number(value);
        break;
      case "pic text":
        options.quote = value.replace(/^\{|\}$/g, "");
        break;
      case "scale":
        options.scale = number(value);
        break;
      default: {
        const place = PLACES.find((name) => key === name || key.startsWith(`${name} `) || key === `${name}=` || key.startsWith(`${name}=`));
        if (place) {
          options.place = place;
          break;
        }
        const arrow = /^(<|latex|stealth|\{latex\}|\{stealth\}|>)?-(>|latex|stealth|\{latex\}|\{stealth\}|<)?$/i.exec(key);
        if (arrow && (arrow[1] || arrow[2])) {
          options.style.arrowStart = Boolean(arrow[1]);
          options.style.arrowEnd = Boolean(arrow[2]);
          break;
        }
        // Anything else is cosmetic (font, inner sep, rounded corners, sloped...): ignored.
      }
    }
  }
  return options;
}

const DEFAULT_STYLE: FigureStyle = {
  stroke: "black", fill: null, fillOpacity: 1, strokeOpacity: 1, opacity: 1, width: 1.6, dash: null, arrowStart: false, arrowEnd: false,
};

// ------------------------------------------------------------ coordinates

interface State {
  named: Map<string, Pt>;
  scale: number;
  vars: Record<string, number>;
}

/** A coordinate's text without its brackets: "1,2", "A", "30:2", "$(A)!0.5!(B)$". */
function coordinate(raw: string, state: State): Pt {
  let text = raw.trim();
  // {(2,1)} and (2,1) where a name is expected (\pic{angle = A--B--{(2,1)}}).
  const wraps = (pair: "{}" | "()") => text.startsWith(pair[0]) && group(text, 0, pair)[1] === text.length;
  if (wraps("{}")) text = text.slice(1, -1).trim();
  if (wraps("()")) text = text.slice(1, -1).trim();
  if (text.startsWith("$") && text.endsWith("$")) return calc(text.slice(1, -1), state);
  // (A |- B): A's x and B's y; (A -| B): B's x and A's y.
  for (const op of ["|-", "-|"] as const) {
    const sides = splitTop(text, op);
    if (sides.length === 2) {
      const a = coordinate(sides[0], state);
      const b = coordinate(sides[1], state);
      return op === "|-" ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
    }
  }
  const polar = splitTop(text, ":");
  if (polar.length === 2 && !text.includes(",")) {
    const angle = number(polar[0], state.vars);
    const r = scaledLength(polar[1], state);
    return { x: r * Math.cos((angle * Math.PI) / 180), y: r * Math.sin((angle * Math.PI) / 180) };
  }
  const xy = splitTop(text, ",");
  if (xy.length === 2) return { x: scaledLength(xy[0], state), y: scaledLength(xy[1], state) };
  const name = text.replace(/\.(north|south|east|west|center|north east|north west|south east|south west)$/, "");
  const point = state.named.get(name);
  if (!point) throw new TikzError(`The point "${name}" isn't defined before it is used`);
  return point;
}

/** ($(A)!0.5!(B)$), ($(A)+(1,2)$), ($0.5*(A)+0.5*(B)$), ($(A)!1!90:(B)$) not supported. */
function calc(text: string, state: State): Pt {
  const partway = /^\s*\((.+?)\)\s*!\s*([^!]+?)\s*!\s*\((.+?)\)\s*$/.exec(text);
  if (partway) {
    const a = coordinate(partway[1], state);
    const b = coordinate(partway[3], state);
    const t = number(partway[2], state.vars);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  // A sum of [factor*](point) terms.
  let x = 0;
  let y = 0;
  let i = 0;
  let sign = 1;
  const body = text.trim();
  let any = false;
  while (i < body.length) {
    const ch = body[i];
    if (ch === " ") {
      i++;
      continue;
    }
    if (ch === "+" || ch === "-") {
      sign = ch === "-" ? -1 : 1;
      i++;
      continue;
    }
    let factor = 1;
    const factorMatch = /^([0-9.]+|\{[^}]*\})\s*\*\s*/.exec(body.slice(i));
    if (factorMatch) {
      factor = number(factorMatch[1], state.vars);
      i += factorMatch[0].length;
    }
    if (body[i] !== "(") throw new TikzError(`Can't read the coordinate calculation "$${text}$"`);
    const [inner, next] = group(body, i, "()");
    const point = coordinate(inner, state);
    x += sign * factor * point.x;
    y += sign * factor * point.y;
    sign = 1;
    any = true;
    i = next;
  }
  if (!any) throw new TikzError(`Can't read the coordinate calculation "$${text}$"`);
  return { x, y };
}

// ------------------------------------------------------------ paths

type Mode = "draw" | "fill" | "filldraw" | "path";

function styleFor(mode: Mode, options: Options): FigureStyle {
  const style: FigureStyle = { ...DEFAULT_STYLE, ...options.style };
  // `\fill[teal!25]`: the bare colour fills too, with its tint (unless the
  // fill has its own colour or opacity).
  if ((mode === "fill" || mode === "filldraw") && !options.style.fill && options.style.fillOpacity === undefined && options.color) {
    style.fillOpacity = options.colorAmount;
  }
  if (mode === "fill") {
    style.fill = options.style.fill ?? options.color ?? "black";
    style.stroke = options.style.stroke && options.style.stroke !== options.color ? options.style.stroke : null;
    if (options.style.stroke === undefined) style.stroke = null;
  } else if (mode === "filldraw") {
    style.fill = options.style.fill ?? options.color ?? "black";
    style.stroke = options.style.stroke ?? "black";
  } else if (mode === "path") {
    style.stroke = options.style.stroke ?? null;
    style.fill = options.style.fill ?? null;
  }
  return style;
}

function pathShapes(body: string, mode: Mode, options: Options, state: State): FigureShape[] {
  const shapes: FigureShape[] = [];
  const style = styleFor(mode, options);
  let current: Pt | null = null;
  let points: Pt[] = [];
  let closed = false;
  let connector: "--" | "|-" | "-|" | null = null;
  // Labels placed along the last segment (node[midway] after a coordinate).
  const flush = () => {
    // A \path draws nothing (it only places nodes).
    if (points.length >= 2 && (style.stroke || style.fill)) shapes.push({ kind: "path", points, closed, style });
    points = [];
    closed = false;
  };
  let i = 0;
  const text = body.trim();
  while (i < text.length) {
    const rest = text.slice(i);
    if (/^\s/.test(rest)) {
      i++;
      continue;
    }
    if (rest.startsWith("--")) {
      connector = "--";
      i += 2;
      continue;
    }
    if (rest.startsWith("|-") || rest.startsWith("-|")) {
      connector = rest.startsWith("|-") ? "|-" : "-|";
      i += 2;
      continue;
    }
    const word = /^(cycle|circle|arc|rectangle|grid|node|coordinate|to|ellipse|plot|edge|parabola|sin|cos)\b/.exec(rest);
    if (word) {
      i += word[0].length;
      const name = word[1];
      if (name === "cycle") {
        closed = true;
        connector = null;
        flush();
        if (current) points = [current];
        continue;
      }
      if (name === "to") {
        // "to" without options is a straight line.
        const after = text.slice(i).trimStart();
        if (after.startsWith("[")) {
          const [opts, end] = group(text, i + (text.slice(i).length - after.length), "[]");
          if (opts.trim()) throw new TikzError(`"to[${opts}]" isn't supported - use "--"`);
          i = end;
        }
        connector = "--";
        continue;
      }
      if (name === "circle") {
        if (!current) throw new TikzError("circle needs a centre before it");
        let r: number;
        const after = text.slice(i).trimStart();
        const offset = text.slice(i).length - after.length;
        if (after.startsWith("[")) {
          const [opts, end] = group(text, i + offset, "[]");
          const o = parseOptions(opts);
          if (o.radius === null) throw new TikzError("circle[...] needs radius=");
          r = o.radius * state.scale;
          i = end;
        } else if (after.startsWith("(")) {
          const [inner, end] = group(text, i + offset, "()");
          r = scaledLength(inner, state);
          i = end;
        } else throw new TikzError('circle needs a radius: "circle (2)"');
        shapes.push({ kind: "circle", center: current, r, style });
        continue;
      }
      if (name === "arc") {
        if (!current) throw new TikzError("arc needs a starting point before it");
        const after = text.slice(i).trimStart();
        const offset = text.slice(i).length - after.length;
        let start: number;
        let end: number;
        let r: number;
        if (after.startsWith("[")) {
          const [opts, next] = group(text, i + offset, "[]");
          const o = parseOptions(opts);
          if (o.startAngle === null || o.endAngle === null || o.radius === null) throw new TikzError("arc[...] needs start angle=, end angle= and radius=");
          [start, end, r] = [o.startAngle, o.endAngle, o.radius * state.scale];
          i = next;
        } else if (after.startsWith("(")) {
          const [inner, next] = group(text, i + offset, "()");
          const parts = splitTop(inner, ":");
          if (parts.length !== 3) throw new TikzError('arc takes "(start:end:radius)"');
          [start, end, r] = [number(parts[0], state.vars), number(parts[1], state.vars), scaledLength(parts[2], state)];
          i = next;
        } else throw new TikzError('arc needs "(start:end:radius)"');
        const center: Pt = { x: current.x - r * Math.cos((start * Math.PI) / 180), y: current.y - r * Math.sin((start * Math.PI) / 180) };
        flush();
        shapes.push({ kind: "arc", center, r, start, end, style });
        current = { x: center.x + r * Math.cos((end * Math.PI) / 180), y: center.y + r * Math.sin((end * Math.PI) / 180) };
        points = [current];
        continue;
      }
      if (name === "rectangle" || name === "grid") {
        if (!current) throw new TikzError(`${name} needs a corner before it`);
        let gridOptions: Options | null = null;
        let after = text.slice(i).trimStart();
        let offset = text.slice(i).length - after.length;
        if (name === "grid" && after.startsWith("[")) {
          const [opts, next] = group(text, i + offset, "[]");
          gridOptions = parseOptions(opts);
          i = next;
          after = text.slice(i).trimStart();
          offset = text.slice(i).length - after.length;
        }
        if (!after.startsWith("(")) throw new TikzError(`${name} needs the opposite corner`);
        const [inner, next] = group(text, i + offset, "()");
        const corner = coordinate(inner, state);
        i = next;
        flush();
        if (name === "rectangle") {
          shapes.push({ kind: "path", points: [current, { x: corner.x, y: current.y }, corner, { x: current.x, y: corner.y }], closed: true, style });
        } else {
          const step = (gridOptions?.stepGrid ?? options.stepGrid ?? 1) * state.scale;
          shapes.push({ kind: "grid", from: current, to: corner, step, style: { ...style, ...(gridOptions?.style ?? {}) } });
        }
        current = corner;
        points = [corner];
        continue;
      }
      if (name === "node") {
        let nodeOptions = parseOptions("");
        let after = text.slice(i).trimStart();
        let offset = text.slice(i).length - after.length;
        while (after.startsWith("[") || after.startsWith("(")) {
          if (after.startsWith("[")) {
            const [opts, next] = group(text, i + offset, "[]");
            nodeOptions = parseOptions(opts);
            i = next;
          } else {
            const [, next] = group(text, i + offset, "()"); // a node name - ignored
            i = next;
          }
          after = text.slice(i).trimStart();
          offset = text.slice(i).length - after.length;
        }
        if (!after.startsWith("{")) throw new TikzError("node needs its text in {...}");
        const [label, next] = group(text, i + offset, "{}");
        i = next;
        let at = current;
        if (nodeOptions.pos !== null && points.length >= 2) {
          const a = points[points.length - 2];
          const b = points[points.length - 1];
          at = { x: a.x + (b.x - a.x) * nodeOptions.pos, y: a.y + (b.y - a.y) * nodeOptions.pos };
        }
        if (!at) throw new TikzError("node needs a point before it");
        if (cleanLabel(label)) shapes.push({ kind: "label", at, text: cleanLabel(label), place: nodeOptions.place ?? "center", color: nodeOptions.color ?? options.color });
        continue;
      }
      if (name === "coordinate") {
        const after = text.slice(i).trimStart();
        const offset = text.slice(i).length - after.length;
        if (!after.startsWith("(") || !current) throw new TikzError("coordinate needs a name: coordinate (M)");
        const [inner, next] = group(text, i + offset, "()");
        state.named.set(inner.trim(), current);
        i = next;
        continue;
      }
      throw new TikzError(`"${name}" isn't supported in a path yet`);
    }
    // A coordinate: (x,y), ++(dx,dy), +(dx,dy).
    const relative = rest.startsWith("++") ? "++" : rest.startsWith("+") ? "+" : null;
    const at = i + (relative ? relative.length : 0);
    if (text[at] === "(") {
      const [inner, next] = group(text, at, "()");
      let point = coordinate(inner, state);
      if (relative) {
        if (!current) throw new TikzError("A relative coordinate needs a point before it");
        point = { x: current.x + point.x, y: current.y + point.y };
      }
      i = next;
      if (connector && current) {
        if (connector === "|-") points.push({ x: current.x, y: point.y });
        else if (connector === "-|") points.push({ x: point.x, y: current.y });
        points.push(point);
      } else {
        flush();
        points = [point];
      }
      if (relative !== "+") current = point;
      connector = null;
      continue;
    }
    throw new TikzError(`Didn't understand "${rest.slice(0, 30)}"`);
  }
  flush();
  return shapes;
}

/** Node text: keep $...$ and words, drop sizing commands. */
function cleanLabel(raw: string): string {
  return raw
    .replace(/\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|bfseries|itshape)\b\s*/g, "")
    .replace(/\\\\/g, " ")
    // "$ 3 $" (how {{a}} placeholders are often written) renders as math only without the inner spaces.
    .replace(/\$\s*([^$]*?)\s*\$/g, (_, inner: string) => `$${inner}$`)
    .trim();
}

// ------------------------------------------------------------ statements

/** Reads TikZ into shapes. Throws TikzError naming what isn't supported. */
export function parseTikz(source: string, vars: Record<string, number> = {}): Figure {
  let text = source
    .replace(/(^|[^\\])%.*$/gm, "$1")
    .replace(/\\usetikzlibrary\{[^}]*\}/g, "")
    .trim();
  const state: State = { named: new Map(), scale: 1, vars };
  const begin = /\\begin\{tikzpicture\}\s*(\[[^\]]*\])?/.exec(text);
  if (begin) {
    if (begin[1]) {
      const options = parseOptions(begin[1].slice(1, -1));
      if (options.scale !== null) state.scale = options.scale;
    }
    text = text.slice(begin.index + begin[0].length);
    const end = text.indexOf("\\end{tikzpicture}");
    if (end >= 0) text = text.slice(0, end);
  }
  const shapes: FigureShape[] = [];
  for (const statement of splitTop(text, ";")) {
    const command = /^\\([A-Za-z]+)\s*/.exec(statement);
    if (!command) throw new TikzError(`Didn't understand "${statement.slice(0, 40)}"`);
    let rest = statement.slice(command[0].length);
    const name = command[1];
    let options = parseOptions("");
    if (rest.startsWith("[")) {
      const [opts, next] = group(rest, 0, "[]");
      options = parseOptions(opts);
      rest = rest.slice(next).trim();
    }
    switch (name) {
      case "draw":
      case "fill":
      case "filldraw":
      case "path":
        shapes.push(...pathShapes(rest, name, options, state));
        break;
      case "coordinate": {
        const match = /^\((.+?)\)\s*at\s*([\s\S]+)$/.exec(rest);
        if (!match) throw new TikzError('Write a coordinate as "\\coordinate (A) at (1,2);"');
        const at = match[2].trim();
        if (!at.startsWith("(")) throw new TikzError(`Can't read the point of "${match[1]}"`);
        state.named.set(match[1].trim(), coordinate(group(at, 0, "()")[0], state));
        break;
      }
      case "node": {
        let nodeName: string | null = null;
        let at: Pt | null = null;
        let label: string | null = null;
        let r = rest;
        while (r) {
          if (r.startsWith("(")) {
            const [inner, next] = group(r, 0, "()");
            nodeName = inner.trim();
            r = r.slice(next).trim();
          } else if (r.startsWith("at")) {
            r = r.slice(2).trim();
            const [inner, next] = group(r, 0, "()");
            at = coordinate(inner, state);
            r = r.slice(next).trim();
          } else if (r.startsWith("[")) {
            const [opts, next] = group(r, 0, "[]");
            options = parseOptions(opts);
            r = r.slice(next).trim();
          } else if (r.startsWith("{")) {
            const [inner, next] = group(r, 0, "{}");
            label = inner;
            r = r.slice(next).trim();
          } else throw new TikzError(`Didn't understand the node "${statement.slice(0, 40)}"`);
        }
        const point = at ?? { x: 0, y: 0 };
        if (nodeName) state.named.set(nodeName, point);
        if (label !== null && cleanLabel(label)) {
          shapes.push({ kind: "label", at: point, text: cleanLabel(label), place: options.place ?? "center", color: options.color });
        }
        break;
      }
      case "pic": {
        const match = /^\{\s*(right angle|angle)\s*=\s*([\s\S]+?)\s*--\s*([\s\S]+?)\s*--\s*([\s\S]+?)\s*\}$/.exec(rest);
        if (!match) throw new TikzError('A pic is "\\pic[draw] {angle = B--A--C};" or "{right angle = B--A--C}"');
        const from = coordinate(match[2], state);
        const vertex = coordinate(match[3], state);
        const to = coordinate(match[4], state);
        const style = { ...DEFAULT_STYLE, ...options.style, stroke: options.style.stroke ?? (options.quote !== null && !options.style.stroke ? null : "black") };
        if (/(^|,)\s*draw\s*(,|$|=)/.test(statement.slice(statement.indexOf("[") + 1, statement.indexOf("]")))) style.stroke = options.style.stroke ?? "black";
        shapes.push({
          kind: "angle", vertex, from, to,
          radius: (options.angleRadius ?? 0.5) * (match[1] === "right angle" ? 0.6 : 1),
          right: match[1] === "right angle",
          label: options.quote !== null ? cleanLabel(options.quote) : null,
          eccentricity: options.eccentricity ?? 0.6,
          style,
        });
        break;
      }
      case "clip":
      case "foreach":
      case "begin":
      case "end":
      default:
        throw new TikzError(`\\${name} isn't supported yet`);
    }
  }
  if (shapes.length === 0) throw new TikzError("The figure draws nothing");
  return { shapes };
}

/** Problems with a figure, for the editor and the importer ([] when it's fine). */
export function figureProblems(source: string | null | undefined, vars: Record<string, number> = {}): string[] {
  if (!source || !source.trim()) return [];
  try {
    parseTikz(source, vars);
    return [];
  } catch (error) {
    if (error instanceof TikzError) return [`Figure: ${error.message}`];
    throw error;
  }
}
