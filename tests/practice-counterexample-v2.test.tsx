import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PracticeProgressView } from "@/components/practice/practice-progress-view";
import {
  addCounterexampleAnswer,
  counterexampleHint,
  emptyCounterexampleTally,
  type PracticeStudentProgress,
} from "@/lib/practice-bank";

vi.mock("@/app/protected/teacher/practice-actions", () => ({ getPracticeProgressOverviewAction: vi.fn() }));

describe("tallying counterexample answers", () => {
  it("counts answers, right ones, and each kind of mistake", () => {
    const tally = emptyCounterexampleTally();
    addCounterexampleAnswer(tally, true, null);
    addCounterexampleAnswer(tally, false, "h");
    addCounterexampleAnswer(tally, false, "h");
    addCounterexampleAnswer(tally, false, "claim");
    // An old answer without a detail still counts as a wrong one.
    addCounterexampleAnswer(tally, false, null);
    expect(tally).toMatchObject({ answers: 5, right: 1, claim: 1, h: 2, c: 0, other: 1 });
  });

  it("names the habit once there are enough mistakes", () => {
    expect(counterexampleHint({ claim: 0, h: 2, c: 0, other: 0 })).toBeNull();
    expect(counterexampleHint({ claim: 1, h: 4, c: 1, other: 0 })).toMatch(/hypothesis doesn't hold/);
    expect(counterexampleHint({ claim: 0, h: 0, c: 3, other: 0 })).toMatch(/conclusion still holds/);
    expect(counterexampleHint({ claim: 3, h: 0, c: 0, other: 1 })).toMatch(/calls the claim itself wrong/);
    expect(counterexampleHint({ claim: 2, h: 2, c: 2, other: 0 })).toMatch(/spread out/);
  });
});

const student = (overrides: Partial<PracticeStudentProgress>): PracticeStudentProgress => ({
  studentId: "s1",
  name: "Μαρία Παπαδοπούλου",
  classes: ["Γ Λυκείου"],
  week: { answers: 12, right: 8, days: 3 },
  allTime: { answers: 40, right: 28 },
  lastPracticed: new Date().toISOString(),
  dailyStreak: 2,
  mistakes: 4,
  points: 280,
  sections: [],
  counterexample: emptyCounterexampleTally(),
  ...overrides,
});

describe("Progress: a student's counterexamples", () => {
  it("shows the answers, each kind of mistake and the habit", async () => {
    render(
      <PracticeProgressView
        initialRows={[student({ counterexample: { answers: 10, right: 4, claim: 1, h: 4, c: 1, other: 0, typed: 3, typedRight: 1, switched: 1 } })]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Μαρία Παπαδοπούλου" }));
    expect(screen.getByText("Counterexamples")).toBeInTheDocument();
    const row = screen.getByText("Hypothesis doesn't hold").parentElement!;
    expect(within(row).getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/Mostly picks examples where the hypothesis doesn't hold/)).toBeInTheDocument();
  });

  it("stays out of the way for a student who hasn't met one", async () => {
    render(<PracticeProgressView initialRows={[student({})]} />);
    await userEvent.click(screen.getByRole("button", { name: "Μαρία Παπαδοπούλου" }));
    expect(screen.queryByText("Counterexamples")).toBeNull();
  });
});
