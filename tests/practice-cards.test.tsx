import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ParentPracticeCard } from "@/components/practice/parent-practice-card";
import { PortalPracticeCard } from "@/components/practice/portal-practice-card";
import type { ParentPracticeSummary, PracticeSummary } from "@/lib/practice-progress";

const playing: PracticeSummary = { available: true, dailyStreak: 5, points: 1860, mistakes: 4, bestScore: 9 };
const fresh: PracticeSummary = { available: true, dailyStreak: 0, points: 0, mistakes: 0, bestScore: 0 };

describe("PortalPracticeCard (student home)", () => {
  it("shows nothing when there is nothing to play", () => {
    const { container } = render(<PortalPracticeCard summary={{ ...playing, available: false }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the streak, points and mistakes, with a link to the game", () => {
    render(<PortalPracticeCard summary={playing} />);
    expect(screen.getByText("Εξάσκηση")).toBeInTheDocument();
    expect(screen.getByText("5 μέρες")).toBeInTheDocument();
    expect(screen.getByText("1860")).toBeInTheDocument();
    expect(screen.getByText("4 λάθη να ξαναδείς")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Παίξε έναν γύρο" })).toHaveAttribute("href", "/practice");
  });

  it("invites a student who hasn't started, without zero counters", () => {
    render(<PortalPracticeCard summary={fresh} />);
    expect(screen.getByText(/Γύροι 10 ερωτήσεων/)).toBeInTheDocument();
    expect(screen.queryByText("0 μέρες")).not.toBeInTheDocument();
    expect(screen.queryByText(/λάθη να ξαναδείς/)).not.toBeInTheDocument();
  });

  it("says a broken streak can start again", () => {
    render(<PortalPracticeCard summary={{ ...playing, dailyStreak: 0 }} />);
    expect(screen.getByText("Ένας γύρος σήμερα ξεκινά νέο σερί.")).toBeInTheDocument();
  });

  it("leaves out the mistakes when there are none", () => {
    render(<PortalPracticeCard summary={{ ...playing, mistakes: 0 }} />);
    expect(screen.queryByText(/λάθη να ξαναδείς/)).not.toBeInTheDocument();
  });

  it("speaks English with locale en, singular included", () => {
    render(<PortalPracticeCard summary={{ ...playing, dailyStreak: 1, mistakes: 1 }} locale="en" />);
    expect(screen.getByText("Practice")).toBeInTheDocument();
    expect(screen.getByText("1 day")).toBeInTheDocument();
    expect(screen.getByText("1 mistake to review")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Play a round" })).toBeInTheDocument();
    expect(screen.queryByText(/[α-ω]/i)).not.toBeInTheDocument();
  });
});

describe("ParentPracticeCard", () => {
  const week: ParentPracticeSummary = { dailyStreak: 5, weekAnswers: 48, weekRight: 39, weekDays: 4, mistakes: 4 };

  it("shows days, answers and the share right this week", () => {
    render(<ParentPracticeCard summary={week} name="Νίκος" />);
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("48")).toBeInTheDocument();
    // 39 / 48 = 81.25%
    expect(screen.getByText("81%")).toBeInTheDocument();
    expect(screen.getByText("5 μέρες στη σειρά")).toBeInTheDocument();
    expect(screen.getByText("· 4 ερωτήσεις να ξαναδεί")).toBeInTheDocument();
  });

  it("shows a dash, not 0% or NaN, for a week without answers", () => {
    render(<ParentPracticeCard summary={{ dailyStreak: 0, weekAnswers: 0, weekRight: 0, weekDays: 0, mistakes: 0 }} name="Νίκος" />);
    expect(screen.getByText("–")).toBeInTheDocument();
    expect(screen.queryByText(/NaN|0%/)).not.toBeInTheDocument();
    expect(screen.getByText("Νίκος δεν έχει εξασκηθεί αυτή την εβδομάδα.")).toBeInTheDocument();
  });

  it("says the child hasn't practised today when the streak has lapsed", () => {
    render(<ParentPracticeCard summary={{ ...week, dailyStreak: 0 }} name="Νίκος" />);
    expect(screen.getByText("Νίκος δεν έχει εξασκηθεί σήμερα.")).toBeInTheDocument();
  });

  it("speaks English with locale en", () => {
    render(<ParentPracticeCard summary={{ ...week, weekDays: 1, mistakes: 1 }} name="Alex" locale="en" />);
    expect(screen.getByText("Practice")).toBeInTheDocument();
    expect(screen.getByText("day this week")).toBeInTheDocument();
    expect(screen.getByText("5 days in a row")).toBeInTheDocument();
    expect(screen.getByText("· 1 question to look at again")).toBeInTheDocument();
    expect(screen.queryByText(/[α-ω]/i)).not.toBeInTheDocument();
  });
});
