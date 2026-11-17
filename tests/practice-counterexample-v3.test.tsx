import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { QuestionScreen } from "@/components/practice/practice-game";
import { toPracticeQuestionColumns } from "@/lib/practice-bank";
import { latexToExpr, readCounterexampleOption } from "@/lib/practice-latex";
import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import { pointsFor, pointsWithBase, COUNTEREXAMPLE_POINTS } from "@/lib/practice-progress";
import { counterexampleStep, type PracticeViewer, type RoundQuestion } from "@/lib/practice-server";
import { checkTypedCounterexample, instantiate, seededRng } from "@/lib/practice-template";

vi.mock("@/app/practice/actions", () => ({
  checkTypedCounterexampleAction: vi.fn().mockResolvedValue({ ok: false, reason: "unavailable" }),
  drawPracticeRoundAction: vi.fn(),
  reportPracticeQuestionAction: vi.fn(),
  syncPracticeProgressAction: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceRoleClient: vi.fn() }));

// From panellinies-sl.md: options with a point, and one that isn't a single formula.
const CONTINUOUS = `## Ο ισχυρισμός «κάθε συνάρτηση συνεχής στο $x_0$ είναι παραγωγίσιμη στο $x_0$».
Type: counterexample
Answer: Λάθος
- [x] $f(x) = |x|$, στο $x_0 = 0$
  Συνεχής στο $0$, όχι παραγωγίσιμη.
- [c] $f(x) = x^2$, στο $x_0 = 0$
  Παραγωγίσιμη στο $0$.
- [h] $f(x) = \\frac{|x|}{x}$, στο $x_0 = 0$
  Δεν ορίζεται στο $0$.
- [c] $f(x) = \\sqrt{x}$, στο $x_0 = 4$
  Παραγωγίσιμη στο $4$.
`;
const INCREASING = `## Ο ισχυρισμός «γνησίως αύξουσα και παραγωγίσιμη $\\Rightarrow f' > 0$».
Type: counterexample
Answer: Λάθος
- [x] $f(x) = x^3$
  $f'(0) = 0$.
- [c] $f(x) = e^x$
  $f' > 0$.
- [h] $f(x) = x^2$
  Δεν είναι γνησίως αύξουσα.
`;
const PIECEWISE = `## Ο ισχυρισμός «κάθε 1-1 συνάρτηση είναι γνησίως μονότονη».
Type: counterexample
Answer: Λάθος
Mode: typed
- [x] $f(x) = x$ για $x \\leq 0$ και $f(x) = \\frac{1}{x}$ για $x > 0$
- [c] $f(x) = x^3$
`;
const spec = (text: string) => {
  const parsed = parsePracticeMarkdown(text);
  expect(parsed.errors).toEqual([]);
  return parsed.questions[0];
};
const played = (text: string) => instantiate(spec(text), seededRng(1));

describe("reading the teacher's options as formulas", () => {
  it("reads the usual school LaTeX", () => {
    for (const [tex, ok] of [
      ["|x|", true], ["\\frac{|x|}{x}", true], ["\\sqrt{x}", true], ["e^{2x}", true], ["x^4", true], ["\\ln x", true],
      ["\\text{ημ}\\,x", true], ["x \\cdot \\sin x", true], ["\\frac12", true], ["xe^x", true],
      ["x \\leq 0", false], ["\\begin{cases} x \\end{cases}", false], ["g(x)", false],
    ] as const) {
      expect(latexToExpr(tex) !== null, tex).toBe(ok);
    }
  });

  it("reads an option and its point, and leaves out what isn't one formula", () => {
    expect(readCounterexampleOption("$f(x) = |x|$, στο $x_0 = 0$")).toMatchObject({ x0: 0 });
    expect(readCounterexampleOption("$f(x) = \\sqrt{x}$, στο $x_0 = 4$")).toMatchObject({ x0: 4 });
    expect(readCounterexampleOption("$f(x) = x$, με $x_0 = 0$")).toMatchObject({ expr: "x", x0: 0 });
    expect(readCounterexampleOption("$f(x) = x^3$")).toMatchObject({ x0: null });
    expect(readCounterexampleOption("$f(x) = x$ για $x \\leq 0$ και $f(x) = \\frac{1}{x}$ για $x > 0$")).toBeNull();
    expect(readCounterexampleOption("$f(x) = \\frac{1}{x} + 1$ και $g(x) = -\\frac{1}{x}$")).toBeNull();
  });

  it("marks a question typeable only when its counterexample reads as a formula", () => {
    expect(played(CONTINUOUS).typeable).toEqual({ x0: true });
    expect(played(INCREASING).typeable).toEqual({ x0: false });
    expect(played(PIECEWISE).typeable).toBeNull();
  });
});

describe("checking a typed counterexample against the options", () => {
  it("takes the marker of the option it equals, in any form", () => {
    const q = played(CONTINUOUS);
    expect(checkTypedCounterexample(q, "|x|", "0")).toBe("right");
    expect(checkTypedCounterexample(q, "sqrt(x^2)", "0")).toBe("right");
    expect(checkTypedCounterexample(q, "x²", "0")).toBe("c");
    expect(checkTypedCounterexample(q, "|x|/x", "0")).toBe("h");
    // The point matters: √x is the [c] option only at 4.
    expect(checkTypedCounterexample(q, "√x", "4")).toBe("c");
    expect(checkTypedCounterexample(q, "√x", "0")).toBe("unknown");
    // Another (valid) counterexample can't be judged without the AI yet.
    expect(checkTypedCounterexample(q, "|x - 1|", "1")).toBe("unknown");
    expect(checkTypedCounterexample(q, "2(x", "0")).toBe("unknown");
  });

  it("ignores the point when the options have none", () => {
    const q = played(INCREASING);
    expect(checkTypedCounterexample(q, "x^3", null)).toBe("right");
    expect(checkTypedCounterexample(q, "e^x", null)).toBe("c");
    expect(checkTypedCounterexample(q, "x*x", null)).toBe("h");
  });
});

describe("options or typed, per player", () => {
  const student: PracticeViewer = { kind: "student", studentId: "s", firstName: "Μ", grade: "lyk_c" };
  const step = (text: string, viewer: PracticeViewer, rightBefore: boolean) => counterexampleStep(played(text), viewer, rightBefore);

  it("auto: options first, typed once the student has got it right", () => {
    expect(step(INCREASING, student, false)).toBe("options");
    expect(step(INCREASING, student, true)).toBe("typed");
  });

  it("always options for guests and parents, and for a counterexample that can't be typed", () => {
    expect(step(INCREASING, { kind: "guest" }, true)).toBe("options");
    expect(step(INCREASING, { kind: "parent" }, true)).toBe("options");
    expect(step(PIECEWISE, student, true)).toBe("options");
  });

  it("follows the teacher's setting", () => {
    expect(step(INCREASING.replace("Answer: Λάθος", "Answer: Λάθος\nMode: typed"), student, false)).toBe("typed");
    expect(step(INCREASING.replace("Answer: Λάθος", "Answer: Λάθος\nMode: options"), student, true)).toBe("options");
    // The teacher can try "typed" questions; "auto" stays options for them.
    expect(step(INCREASING.replace("Answer: Λάθος", "Answer: Λάθος\nMode: typed"), { kind: "teacher" }, false)).toBe("typed");
    expect(step(INCREASING, { kind: "teacher" }, false)).toBe("options");
  });

  it("stores the setting, and reads Mode: in a file", () => {
    expect(toPracticeQuestionColumns(spec(PIECEWISE)).counterexample_mode).toBe("typed");
    expect(toPracticeQuestionColumns(spec(INCREASING)).counterexample_mode).toBe("auto");
    expect(parsePracticeMarkdown(INCREASING.replace("Answer: Λάθος", "Answer: Λάθος\nMode: sometimes")).errors.join()).toMatch(/Mode is auto, options or typed/);
    expect(parsePracticeMarkdown("## 2 + 2?\nAnswer: 4\nMode: typed\n").errors.join()).toMatch(/Mode only goes with "Type: counterexample"/);
  });
});

describe("points", () => {
  it("typed 15, options 10, switched 5, plus the streak bonus", () => {
    expect(COUNTEREXAMPLE_POINTS).toEqual({ typed: 15, options: 10, switched: 5 });
    expect(pointsWithBase(1, 15)).toBe(15);
    expect(pointsWithBase(3, 5)).toBe(10);
    expect([0, 1, 2, 3].map(pointsFor)).toEqual([10, 10, 10, 15]);
  });
});

describe("the typed step in the game", () => {
  const round = (text: string): RoundQuestion => ({
    ...played(text), id: "q", sectionId: "s", sectionName: "Παράγωγος", imageUrl: null, step2: "typed",
  });
  function play(text: string) {
    const onAnswer = vi.fn(() => ({ points: 15, streak: 1 }));
    render(<QuestionScreen question={round(text)} index={0} total={3} results={[]} onAnswer={onAnswer} onNext={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Ψευδής" }));
    return onAnswer;
  }
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const check = () => fireEvent.click(screen.getByRole("button", { name: "Έλεγχος" }));

  it("asks for f(x) and x₀, and is right with the counterexample", () => {
    const onAnswer = play(CONTINUOUS);
    expect(screen.getByText(/Γράψε ένα αντιπαράδειγμα/)).toBeInTheDocument();
    type("Το αντιπαράδειγμά σου", "|x|");
    expect(screen.getByRole("button", { name: "Έλεγχος" })).toBeDisabled();
    type("Το σημείο x0", "0");
    check();
    expect(onAnswer).toHaveBeenCalledWith(true, null, { mode: "typed", typed: "|x| @ 0" });
    expect(screen.getByText("✓ αντιπαράδειγμα")).toBeInTheDocument();
  });

  it("names a wrong one by the option it equals, and why", () => {
    const onAnswer = play(INCREASING);
    type("Το αντιπαράδειγμά σου", "x^2");
    check();
    expect(onAnswer).toHaveBeenCalledWith(false, "h", { mode: "typed", typed: "x^2" });
    expect(screen.getByText("Δεν είναι γνησίως αύξουσα.")).toBeInTheDocument();
  });

  it("falls back to the options for what it can't judge, not counted as wrong", async () => {
    const onAnswer = play(INCREASING);
    type("Το αντιπαράδειγμά σου", "x^3 + x^5");
    check();
    expect(await screen.findByText(/Δεν μπορώ να ελέγξω/)).toBeInTheDocument();
    expect(onAnswer).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button").find((button) => button.textContent?.includes("x3"))!);
    expect(onAnswer).toHaveBeenCalledWith(true, null, { mode: "options", typed: "x^3 + x^5" });
  });

  it("switches to the options on request, for fewer points", () => {
    const onAnswer = play(INCREASING);
    fireEvent.click(screen.getByRole("button", { name: /Δείξε μου επιλογές/ }));
    fireEvent.click(screen.getAllByRole("button").find((button) => button.textContent?.includes("x3"))!);
    expect(onAnswer).toHaveBeenCalledWith(true, null, { mode: "switched" });
  });
});
