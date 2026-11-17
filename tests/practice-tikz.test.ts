import { describe, expect, it } from "vitest";

import { toPracticeQuestionColumns } from "@/lib/practice-bank";
import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import { fillFigure, instantiate, seededRng, validatePracticeQuestion } from "@/lib/practice-template";
import { figureProblems, parseTikz, type FigureShape } from "@/lib/practice-tikz";

const kinds = (source: string) => parseTikz(source).shapes.map((shape) => shape.kind);
const only = <K extends FigureShape["kind"]>(source: string, kind: K) =>
  parseTikz(source).shapes.filter((shape): shape is Extract<FigureShape, { kind: K }> => shape.kind === kind);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-9;

describe("reading TikZ", () => {
  it("a triangle with named points, a right angle, a marked angle and labels", () => {
    const source = String.raw`\begin{tikzpicture}[scale=0.5]
      \coordinate (A) at (0,0); \coordinate (B) at (4,0); \coordinate (C) at (0,3);
      \draw[thick] (A) -- (B) -- (C) -- cycle; % the triangle
      \pic[draw] {right angle = B--A--C};
      \pic[draw, "$\omega$", angle eccentricity=1.6] {angle = C--B--A};
      \node[below left] at (A) {$A$};
      \path (A) -- (B) node[midway, below] {$4$};
    \end{tikzpicture}`;
    expect(kinds(source)).toEqual(["path", "angle", "angle", "label", "label"]);
    const [triangle] = only(source, "path");
    expect(triangle).toMatchObject({ closed: true, points: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1.5 }], style: { width: 2.4 } });
    const [right, omega] = only(source, "angle");
    expect(right).toMatchObject({ right: true, vertex: { x: 0, y: 0 }, label: null });
    expect(omega).toMatchObject({ right: false, label: "$\\omega$", eccentricity: 1.6, vertex: { x: 2, y: 0 } });
    const [, side] = only(source, "label");
    expect(side).toMatchObject({ text: "$4$", place: "below", at: { x: 1, y: 0 } });
  });

  it("calc and projection coordinates: midpoints, sums, (M |- 0,0)", () => {
    const source = String.raw`\coordinate (A) at (0,0); \coordinate (B) at (4,0); \coordinate (D) at (1,2);
      \coordinate (C) at ($(B)+(D)-(A)$);
      \coordinate (O) at ($(A)!0.5!(C)$);
      \coordinate (G) at ($0.5*(A)+0.5*(B)$);
      \draw (C) -- (O) -- (G);
      \draw (D) -- (D |- 0,0) -- (0,0 -| C);`;
    const [first, second] = only(source, "path");
    expect(first.points).toEqual([{ x: 5, y: 2 }, { x: 2.5, y: 1 }, { x: 2, y: 0 }]);
    expect(second.points).toEqual([{ x: 1, y: 2 }, { x: 1, y: 0 }, { x: 5, y: 0 }]);
  });

  it("the trigonometric circle: polar points in degrees, arcs, circles in pt that ignore scale", () => {
    const source = String.raw`\begin{tikzpicture}[scale=2]
      \draw (0,0) circle (1);
      \draw (0,0) -- (30:1) coordinate (M);
      \fill (M) circle (2pt);
      \draw (0.3,0) arc (0:30:0.3);
      \draw ({cos(60)},{sin(60)}) -- (0,0);
    \end{tikzpicture}`;
    const circles = only(source, "circle");
    expect(circles[0].r).toBe(2);
    expect(circles[1].r).toBeCloseTo(2 / 28.4527559);
    expect(circles[1].style.fill).toBe("black");
    expect(close(circles[1].center.x, 2 * Math.cos(Math.PI / 6))).toBe(true);
    const [arc] = only(source, "arc");
    expect(arc).toMatchObject({ start: 0, end: 30, r: 0.6 });
    expect(close(arc.center.x, 0) && close(arc.center.y, 0)).toBe(true);
    const last = only(source, "path").at(-1)!;
    expect(last.points[0].x).toBeCloseTo(1);
    expect(last.points[0].y).toBeCloseTo(Math.sqrt(3));
  });

  it("vectors: arrows, colours, relative points, a grid", () => {
    const source = String.raw`\draw[help lines] (0,0) grid (4,3);
      \draw[->, thick, red] (0,0) -- (3,1) node[midway, above] {$\vec{a}$};
      \draw[<->, blue] (3,1) -- ++(-1,2);
      \filldraw[fill=blue!20, draw=black, dashed] (0,0) rectangle (1,1);`;
    expect(kinds(source)).toEqual(["grid", "label", "path", "path", "path"]);
    const [vector, both, square] = only(source, "path");
    expect(vector.style).toMatchObject({ stroke: "red", arrowEnd: true, arrowStart: false });
    expect(both.points).toEqual([{ x: 3, y: 1 }, { x: 2, y: 3 }]);
    expect(both.style).toMatchObject({ stroke: "blue", arrowEnd: true, arrowStart: true });
    expect(square.style).toMatchObject({ fill: "blue", fillOpacity: 0.2, dash: "dashed" });
    expect(only(source, "label")[0]).toMatchObject({ text: "$\\vec{a}$", color: "red" });
  });

  it("names what it doesn't support, and undefined points", () => {
    expect(figureProblems(String.raw`\foreach \i in {1,2} \draw (0,0) -- (\i,1);`)).toEqual(["Figure: \\foreach isn't supported yet"]);
    expect(figureProblems(String.raw`\tkzDefPoint(0,0){A}`)).toEqual(["Figure: \\tkzDefPoint isn't supported yet"]);
    expect(figureProblems(String.raw`\draw (A) -- (B);`)[0]).toMatch(/"A" isn't defined before it is used/);
    expect(figureProblems(String.raw`\draw (0,0) to[bend left] (1,1);`)[0]).toMatch(/isn't supported - use "--"/);
    expect(figureProblems(String.raw`\draw (0,0) -- (1,1);`)).toEqual([]);
    expect(figureProblems("")).toEqual([]);
  });
});

describe("figures in questions", () => {
  const FILE = String.raw`## Στο σχήμα, πόση είναι η $B\Gamma$;
Answer: sqrt(a^2 + b^2)
Variables: a=3|6, b=4|8
Condition: b == 4*a/3
${"```"}tikz
\coordinate (A) at (0,0); \coordinate (B) at ({{b}},0); \coordinate (C) at (0,{{a}});
\draw (A) -- (B) -- (C) -- cycle;
\path (A) -- (B) node[midway, below] {$ {{b/2}} $};
${"```"}

## Και με γυμνό tikzpicture
Answer: 1
\begin{tikzpicture}
\draw (0,0) -- (1,1);
\end{tikzpicture}
`;
  const parsed = parsePracticeMarkdown(FILE);

  it("reads a ```tikz block or a bare tikzpicture as the figure", () => {
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0].figure).toContain("\\coordinate (B) at ({{b}},0);");
    expect(parsed.questions[0].prompt).toBe("Στο σχήμα, πόση είναι η $B\\Gamma$;");
    expect(parsed.questions[1].figure).toBe("\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}");
    expect(toPracticeQuestionColumns(parsed.questions[0]).figure).toContain("\\draw (A) -- (B) -- (C) -- cycle;");
  });

  it("fills the template's numbers: plain in coordinates, the Greek way in labels", () => {
    expect(fillFigure("(0,{{a}}) -- ({{+b}},0) node {$ {{a/4}} $}", { a: 3, b: -2 })).toBe("(0,3) -- (-2,0) node {$ 0{,}75 $}");
    const played = instantiate(parsed.questions[0], seededRng(3));
    expect(played.figure).toMatch(/\(B\) at \((4|8),0\)/);
    expect(parseTikz(played.figure!).shapes.length).toBe(2);
  });

  it("reports a figure that can't be drawn, as a question problem", () => {
    const broken = { ...parsed.questions[1], figure: String.raw`\draw (0,0) -- (P);` };
    expect(validatePracticeQuestion(broken)).toEqual([expect.stringMatching(/Figure: The point "P" isn't defined/)]);
    expect(parsePracticeMarkdown("## Ε\nAnswer: 1\n```tikz\n\\draw (0,0) -- (1,1);\n").errors.join()).toMatch(/figure isn't closed/);
  });
});
