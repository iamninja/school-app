import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { HomePracticeQuestion } from "@/components/practice/home-practice-question";
import { PracticeGame } from "@/components/practice/practice-game";
import type { RoundQuestion } from "@/lib/practice-server";

vi.mock("@/app/practice/actions", () => ({
  drawPracticeRoundAction: vi.fn(),
  reportPracticeQuestionAction: vi.fn(),
  syncPracticeProgressAction: vi.fn(),
}));

const base = {
  id: "q1", sectionId: "s1", sectionName: "Η ευθεία", imageUrl: null, answerY: 0, tolerance: 0, slider: null, graph: null, originLabel: null,
};
const choice: RoundQuestion = {
  ...base, type: "choice", prompt: "Ποια είναι η κλίση;", explanation: "Ο συντελεστής του x.", answer: 0,
  options: [{ text: "3", correct: true }, { text: "-2", correct: false }],
};

describe("HomePracticeQuestion", () => {
  it("shows a right answer, the explanation and the way into practice", async () => {
    render(<HomePracticeQuestion question={choice} gradeLabel="Β Λυκείου" />);
    expect(screen.getByText("Β Λυκείου · Η ευθεία")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /3/ }));
    expect(screen.getByText("Σωστό!")).toBeInTheDocument();
    expect(screen.getByText("Ο συντελεστής του x.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Συνέχισε με έναν γύρο/ })).toHaveAttribute("href", "/practice");
    // One go only.
    expect(screen.getByRole("button", { name: /-2/ })).toBeDisabled();
  });

  it("marks a wrong answer and points out the right one", async () => {
    render(<HomePracticeQuestion question={choice} />);
    await userEvent.click(screen.getByRole("button", { name: /-2/ }));
    expect(screen.getByText("Όχι ακριβώς.")).toBeInTheDocument();
    expect(screen.getByLabelText("Λάθος απάντηση")).toBeInTheDocument();
    expect(screen.getByLabelText("Σωστή απάντηση")).toBeInTheDocument();
  });

  it("plays a true/false question, with its source", async () => {
    render(<HomePracticeQuestion question={{ ...base, type: "true_false", prompt: "Το 2 είναι άρτιος.", explanation: null, answer: 1, options: [], originLabel: "Σχολικό βιβλίο" }} />);
    expect(screen.getByText("Σχολικό βιβλίο")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Λάθος" }));
    expect(screen.getByText("Όχι ακριβώς.")).toBeInTheDocument();
  });
});

describe("/practice?grade=", () => {
  const catalog = [
    { code: "lyk_b", label: "Β Λυκείου", sections: [{ id: "s1", name: "Η ευθεία", count: 5 }], count: 5 },
    { code: "lyk_c", label: "Γ Λυκείου", sections: [{ id: "s2", name: "Όρια", count: 7 }], count: 7 },
  ];

  it("opens at the asked grade's sections", () => {
    render(<PracticeGame catalog={catalog} viewer={{ kind: "guest" }} startGrade="lyk_c" />);
    expect(screen.getByText("Όρια")).toBeInTheDocument();
    expect(screen.queryByText("Ποια τάξη θα εξασκήσεις;")).not.toBeInTheDocument();
  });

  it("ignores a grade that isn't there", () => {
    render(<PracticeGame catalog={catalog} viewer={{ kind: "guest" }} startGrade="nope" />);
    expect(screen.getByText("Ποια τάξη θα εξασκήσεις;")).toBeInTheDocument();
  });
});
