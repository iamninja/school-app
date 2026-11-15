"use client";

import * as React from "react";

import { evalExpr } from "@/lib/practice-expr";
import type { PracticeGraph } from "@/lib/practice-template";

const SIZE = 300;
const PAD = 22;

/** Axis ticks every 1 unit up to 12 per side, else every 2, 5, 10... */
function tickStep(span: number): number {
  for (const step of [1, 2, 5, 10, 20, 50, 100]) if (span / step <= 12) return step;
  return 200;
}

/** A plot's path, broken where it leaves the window or jumps (asymptotes). */
export function plotPath(expr: string, graph: PracticeGraph, toX: (x: number) => number, toY: (y: number) => number): string {
  const samples = 240;
  const span = graph.yMax - graph.yMin;
  let d = "";
  let previous: number | null = null;
  for (let i = 0; i <= samples; i++) {
    const x = graph.xMin + ((graph.xMax - graph.xMin) * i) / samples;
    let y: number;
    try {
      y = evalExpr(expr, { x });
    } catch {
      return "";
    }
    const visible = Number.isFinite(y) && y >= graph.yMin - span && y <= graph.yMax + span;
    if (!visible || (previous !== null && Math.abs(y - previous) > span)) {
      previous = visible ? y : null;
      if (!visible) continue;
      d += `M${toX(x).toFixed(1)} ${toY(y).toFixed(1)}`;
      continue;
    }
    d += `${previous === null ? "M" : "L"}${toX(x).toFixed(1)} ${toY(y).toFixed(1)}`;
    previous = y;
  }
  return d;
}

/**
 * A coordinate grid with optional curves and points. With `onPick` the
 * reader drags (or arrow-keys) a point that snaps to half units - the
 * practice "point" question; without it, it's a static figure.
 */
export function PracticeGraphView({
  graph,
  point,
  onPick,
  answer,
  className,
  label = "Επίπεδο συντεταγμένων",
}: {
  graph: PracticeGraph;
  /** The point to show (the student's pick, or the answer in previews). */
  point?: { x: number; y: number } | null;
  onPick?: (point: { x: number; y: number }) => void;
  /** Shown as a dashed ring - the correct place after answering. */
  answer?: { x: number; y: number } | null;
  className?: string;
  label?: string;
}) {
  const svgRef = React.useRef<SVGSVGElement>(null);
  const clipId = React.useId();
  const dragging = React.useRef(false);
  const toX = (x: number) => PAD + ((x - graph.xMin) / (graph.xMax - graph.xMin)) * (SIZE - 2 * PAD);
  const toY = (y: number) => SIZE - PAD - ((y - graph.yMin) / (graph.yMax - graph.yMin)) * (SIZE - 2 * PAD);
  const clampSnap = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(value * 2) / 2));

  const pick = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!onPick || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const sx = ((event.clientX - rect.left) / rect.width) * SIZE;
    const sy = ((event.clientY - rect.top) / rect.height) * SIZE;
    const x = graph.xMin + ((sx - PAD) / (SIZE - 2 * PAD)) * (graph.xMax - graph.xMin);
    const y = graph.yMin + ((SIZE - PAD - sy) / (SIZE - 2 * PAD)) * (graph.yMax - graph.yMin);
    onPick({ x: clampSnap(x, graph.xMin, graph.xMax), y: clampSnap(y, graph.yMin, graph.yMax) });
  };

  const xStep = tickStep(graph.xMax - graph.xMin);
  const yStep = tickStep(graph.yMax - graph.yMin);
  const xs: number[] = [];
  for (let x = Math.ceil(graph.xMin / xStep) * xStep; x <= graph.xMax; x += xStep) xs.push(x);
  const ys: number[] = [];
  for (let y = Math.ceil(graph.yMin / yStep) * yStep; y <= graph.yMax; y += yStep) ys.push(y);
  const axisX = graph.yMin <= 0 && graph.yMax >= 0 ? toY(0) : toY(graph.yMin);
  const axisY = graph.xMin <= 0 && graph.xMax >= 0 ? toX(0) : toX(graph.xMin);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      role="img"
      aria-label={label}
      style={{ touchAction: onPick ? "none" : undefined, userSelect: "none" }}
      onPointerDown={(event) => {
        if (!onPick) return;
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        pick(event);
      }}
      onPointerMove={(event) => dragging.current && pick(event)}
      onPointerUp={() => (dragging.current = false)}
    >
      <rect x={PAD} y={PAD} width={SIZE - 2 * PAD} height={SIZE - 2 * PAD} fill="transparent" />
      {xs.map((x) => (
        <line key={`gx${x}`} x1={toX(x)} y1={toY(graph.yMin)} x2={toX(x)} y2={toY(graph.yMax)} className="stroke-border" strokeWidth={1} />
      ))}
      {ys.map((y) => (
        <line key={`gy${y}`} x1={toX(graph.xMin)} y1={toY(y)} x2={toX(graph.xMax)} y2={toY(y)} className="stroke-border" strokeWidth={1} />
      ))}
      <line x1={toX(graph.xMin)} y1={axisX} x2={toX(graph.xMax)} y2={axisX} className="stroke-muted-foreground" strokeWidth={1.5} />
      <line x1={axisY} y1={toY(graph.yMin)} x2={axisY} y2={toY(graph.yMax)} className="stroke-muted-foreground" strokeWidth={1.5} />
      {xs.filter((x) => x !== 0).map((x) => (
        <text key={`tx${x}`} x={toX(x)} y={axisX + 13} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
          {x}
        </text>
      ))}
      {ys.filter((y) => y !== 0).map((y) => (
        <text key={`ty${y}`} x={axisY - 6} y={toY(y) + 3.5} textAnchor="end" className="fill-muted-foreground" fontSize={10}>
          {y}
        </text>
      ))}
      <clipPath id={clipId}>
        <rect x={PAD} y={PAD} width={SIZE - 2 * PAD} height={SIZE - 2 * PAD} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {graph.plots.map((plot, index) => (
          <path key={`${plot}-${index}`} d={plotPath(plot, graph, toX, toY)} fill="none" className="stroke-sky-500" strokeWidth={2} />
        ))}
      </g>
      {answer ? (
        <circle cx={toX(answer.x)} cy={toY(answer.y)} r={14} fill="none" className="stroke-emerald-500" strokeWidth={2.5} strokeDasharray="4 3" />
      ) : null}
      {point ? (
        <circle
          cx={toX(point.x)}
          cy={toY(point.y)}
          r={onPick ? 11 : 6}
          className="fill-brand stroke-background"
          strokeWidth={3}
          tabIndex={onPick ? 0 : undefined}
          aria-label={onPick ? `Σημείο (${point.x}, ${point.y}) - μετακίνησέ το με τα βελάκια` : undefined}
          onKeyDown={(event) => {
            if (!onPick) return;
            const delta = { ArrowLeft: [-0.5, 0], ArrowRight: [0.5, 0], ArrowUp: [0, 0.5], ArrowDown: [0, -0.5] }[event.key];
            if (!delta) return;
            event.preventDefault();
            onPick({
              x: clampSnap(point.x + delta[0], graph.xMin, graph.xMax),
              y: clampSnap(point.y + delta[1], graph.yMin, graph.yMax),
            });
          }}
        />
      ) : null}
    </svg>
  );
}
