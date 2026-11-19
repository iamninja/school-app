"use client";

// Draws a figure read from TikZ (lib/practice-tikz.ts) as SVG, sized to
// the screen and coloured for light and dark mode. Labels are HTML on top
// of the SVG, so $...$ renders with KaTeX like everywhere else.

import * as React from "react";

import { MathText } from "@/components/math-text";
import { parseTikz, type Figure, type FigureColor, type FigureShape, type FigureStyle, type LabelPlace, type Pt } from "@/lib/practice-tikz";
import { cn } from "@/lib/utils";

const PALETTE: Record<FigureColor, string> = {
  black: "currentColor",
  white: "hsl(var(--background))",
  red: "#e5484d",
  blue: "#3b82f6",
  green: "#22a06b",
  orange: "#f97316",
  purple: "#8b5cf6",
  gray: "#8a8f98",
  brown: "#b7791f",
  cyan: "#06b6d4",
  magenta: "#d946ef",
  teal: "#14b8a6",
  violet: "#7c3aed",
  yellow: "#eab308",
};

const MAX_WIDTH = 340;
const MAX_HEIGHT = 300;
const MAX_PX_PER_CM = 64;
const PAD = 26;

function bounds(figure: Figure): { minX: number; maxX: number; minY: number; maxY: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (p: Pt, r = 0) => {
    xs.push(p.x - r, p.x + r);
    ys.push(p.y - r, p.y + r);
  };
  for (const shape of figure.shapes) {
    if (shape.kind === "path") shape.points.forEach((p) => add(p));
    else if (shape.kind === "circle") add(shape.center, shape.r);
    else if (shape.kind === "arc") {
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const t = ((shape.start + ((shape.end - shape.start) * i) / steps) * Math.PI) / 180;
        add({ x: shape.center.x + shape.r * Math.cos(t), y: shape.center.y + shape.r * Math.sin(t) });
      }
    } else if (shape.kind === "grid") {
      add(shape.from);
      add(shape.to);
    } else if (shape.kind === "label") add(shape.at);
    else add(shape.vertex, shape.radius * Math.max(1, shape.eccentricity));
  }
  if (!xs.length) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

const PLACE_SHIFT: Record<LabelPlace, [number, number]> = {
  center: [-50, -50],
  above: [-50, -100],
  below: [-50, 0],
  left: [-100, -50],
  right: [0, -50],
  "above left": [-100, -100],
  "above right": [0, -100],
  "below left": [-100, 0],
  "below right": [0, 0],
};
const PLACE_NUDGE: Record<LabelPlace, [number, number]> = {
  center: [0, 0],
  above: [0, -4],
  below: [0, 4],
  left: [-5, 0],
  right: [5, 0],
  "above left": [-3, -3],
  "above right": [3, -3],
  "below left": [-3, 3],
  "below right": [3, 3],
};

/**
 * A TikZ figure. `source` is parsed here (null when it can't be - the
 * editor shows why); `vars` are a template's numbers already filled in.
 */
export function PracticeFigure({ source, className, label = "Σχήμα" }: { source: string; className?: string; label?: string }) {
  const figure = React.useMemo(() => {
    try {
      return parseTikz(source);
    } catch {
      return null;
    }
  }, [source]);
  if (!figure) return null;
  return <FigureView figure={figure} className={className} label={label} />;
}

export function FigureView({ figure, className, label = "Σχήμα" }: { figure: Figure; className?: string; label?: string }) {
  const box = bounds(figure);
  const spanX = Math.max(box.maxX - box.minX, 0.5);
  const spanY = Math.max(box.maxY - box.minY, 0.5);
  const px = Math.min((MAX_WIDTH - 2 * PAD) / spanX, (MAX_HEIGHT - 2 * PAD) / spanY, MAX_PX_PER_CM);
  const width = spanX * px + 2 * PAD;
  const height = spanY * px + 2 * PAD;
  const toX = (x: number) => PAD + (x - box.minX) * px;
  const toY = (y: number) => PAD + (box.maxY - y) * px;
  const color = (c: FigureColor | null) => (c ? PALETTE[c] : "none");

  const strokeProps = (style: FigureStyle) => ({
    stroke: color(style.stroke),
    strokeWidth: style.width,
    strokeDasharray: style.dash === "dashed" ? "6 4" : style.dash === "dotted" ? "1.2 4" : undefined,
    strokeLinecap: style.dash === "dotted" ? ("round" as const) : ("round" as const),
    strokeLinejoin: "round" as const,
    fill: style.fill ? color(style.fill) : "none",
    fillOpacity: style.fillOpacity,
    strokeOpacity: style.strokeOpacity < 1 ? style.strokeOpacity : undefined,
    opacity: style.opacity,
  });

  /** A filled arrowhead at `tip`, pointing away from `from` (screen coordinates). */
  const arrowhead = (from: [number, number], tip: [number, number], style: FigureStyle, key: string) => {
    const dx = tip[0] - from[0];
    const dy = tip[1] - from[1];
    const length = Math.hypot(dx, dy) || 1;
    const [ux, uy] = [dx / length, dy / length];
    const size = 7 + style.width * 1.6;
    const back: [number, number] = [tip[0] - ux * size, tip[1] - uy * size];
    const half = size * 0.45;
    const points = [tip, [back[0] - uy * half, back[1] + ux * half], [back[0] + uy * half, back[1] - ux * half]]
      .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
      .join(" ");
    return <polygon key={key} points={points} fill={color(style.stroke ?? "black")} opacity={style.opacity} />;
  };

  const shapes: React.ReactNode[] = [];
  const labels: { at: Pt; text: string; place: LabelPlace; color: FigureColor | null }[] = [];

  figure.shapes.forEach((shape: FigureShape, index) => {
    const key = `s${index}`;
    if (shape.kind === "path") {
      const screen = shape.points.map((p) => [toX(p.x), toY(p.y)] as [number, number]);
      const d = screen.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("") + (shape.closed ? "Z" : "");
      shapes.push(<path key={key} d={d} {...strokeProps(shape.style)} />);
      if (shape.style.arrowEnd && screen.length >= 2) shapes.push(arrowhead(screen[screen.length - 2], screen[screen.length - 1], shape.style, `${key}e`));
      if (shape.style.arrowStart && screen.length >= 2) shapes.push(arrowhead(screen[1], screen[0], shape.style, `${key}b`));
    } else if (shape.kind === "circle") {
      shapes.push(<circle key={key} cx={toX(shape.center.x)} cy={toY(shape.center.y)} r={Math.max(shape.r * px, 1.5)} {...strokeProps(shape.style)} />);
    } else if (shape.kind === "arc") {
      const at = (deg: number): [number, number] => [
        toX(shape.center.x + shape.r * Math.cos((deg * Math.PI) / 180)),
        toY(shape.center.y + shape.r * Math.sin((deg * Math.PI) / 180)),
      ];
      const [sx, sy] = at(shape.start);
      const [ex, ey] = at(shape.end);
      const sweep = shape.end - shape.start;
      const large = Math.abs(sweep) > 180 ? 1 : 0;
      // SVG's y points down, so counterclockwise in TikZ is sweep-flag 0.
      const d = `M${sx.toFixed(1)} ${sy.toFixed(1)}A${(shape.r * px).toFixed(1)} ${(shape.r * px).toFixed(1)} 0 ${large} ${sweep > 0 ? 0 : 1} ${ex.toFixed(1)} ${ey.toFixed(1)}`;
      shapes.push(<path key={key} d={d} {...strokeProps({ ...shape.style, fill: null })} />);
      if (shape.style.arrowEnd) shapes.push(arrowhead(at(shape.end - Math.sign(sweep) * 4), [ex, ey], shape.style, `${key}e`));
      if (shape.style.arrowStart) shapes.push(arrowhead(at(shape.start + Math.sign(sweep) * 4), [sx, sy], shape.style, `${key}b`));
    } else if (shape.kind === "grid") {
      const lines: React.ReactNode[] = [];
      const [x0, x1] = [Math.min(shape.from.x, shape.to.x), Math.max(shape.from.x, shape.to.x)];
      const [y0, y1] = [Math.min(shape.from.y, shape.to.y), Math.max(shape.from.y, shape.to.y)];
      const step = shape.step > 0 ? shape.step : 1;
      for (let x = Math.ceil(x0 / step - 1e-9) * step; x <= x1 + 1e-9; x += step) {
        lines.push(<line key={`x${x}`} x1={toX(x)} y1={toY(y0)} x2={toX(x)} y2={toY(y1)} />);
      }
      for (let y = Math.ceil(y0 / step - 1e-9) * step; y <= y1 + 1e-9; y += step) {
        lines.push(<line key={`y${y}`} x1={toX(x0)} y1={toY(y)} x2={toX(x1)} y2={toY(y)} />);
      }
      shapes.push(
        <g key={key} {...strokeProps({ ...shape.style, fill: null })}>
          {lines}
        </g>,
      );
    } else if (shape.kind === "label") {
      labels.push(shape);
    } else {
      // Angle marks: counterclockwise from the first ray to the second, as in TikZ.
      const a1 = Math.atan2(shape.from.y - shape.vertex.y, shape.from.x - shape.vertex.x);
      let a2 = Math.atan2(shape.to.y - shape.vertex.y, shape.to.x - shape.vertex.x);
      while (a2 <= a1) a2 += 2 * Math.PI;
      const r = shape.radius;
      const point = (t: number, radius: number): Pt => ({ x: shape.vertex.x + radius * Math.cos(t), y: shape.vertex.y + radius * Math.sin(t) });
      if (shape.style.stroke) {
        if (shape.right) {
          const p1 = point(a1, r);
          const p2 = point(a2, r);
          const corner = { x: p1.x + p2.x - shape.vertex.x, y: p1.y + p2.y - shape.vertex.y };
          const d = [p1, corner, p2].map((p, i) => `${i ? "L" : "M"}${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)}`).join("");
          shapes.push(<path key={key} d={d} {...strokeProps({ ...shape.style, width: Math.min(shape.style.width, 1.4), fill: null })} />);
        } else {
          const p1 = point(a1, r);
          const p2 = point(a2, r);
          const large = a2 - a1 > Math.PI ? 1 : 0;
          const d = `M${toX(p1.x).toFixed(1)} ${toY(p1.y).toFixed(1)}A${(r * px).toFixed(1)} ${(r * px).toFixed(1)} 0 ${large} 0 ${toX(p2.x).toFixed(1)} ${toY(p2.y).toFixed(1)}`;
          shapes.push(<path key={key} d={d} {...strokeProps({ ...shape.style, width: Math.min(shape.style.width, 1.4), fill: null })} />);
        }
      }
      if (shape.label) {
        labels.push({ at: point((a1 + a2) / 2, r * shape.eccentricity), text: shape.label, place: "center", color: null });
      }
    }
  });

  return (
    <div className={cn("relative mx-auto w-full text-foreground", className)} style={{ maxWidth: width }} role="img" aria-label={label}>
      <svg viewBox={`0 0 ${width.toFixed(1)} ${height.toFixed(1)}`} className="block h-auto w-full overflow-visible">
        {shapes}
      </svg>
      {labels.map((item, index) => {
        const [sx, sy] = PLACE_SHIFT[item.place];
        const [nx, ny] = PLACE_NUDGE[item.place];
        return (
          <span
            key={`l${index}`}
            className="pointer-events-none absolute whitespace-nowrap text-[0.95rem] leading-none"
            style={{
              left: `${(toX(item.at.x) / width) * 100}%`,
              top: `${(toY(item.at.y) / height) * 100}%`,
              transform: `translate(calc(${sx}% + ${nx}px), calc(${sy}% + ${ny}px))`,
              color: item.color && item.color !== "black" ? PALETTE[item.color] : undefined,
            }}
          >
            <MathText text={item.text} />
          </span>
        );
      })}
    </div>
  );
}
