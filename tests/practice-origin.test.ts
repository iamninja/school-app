import { describe, expect, it } from "vitest";

import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import { PRACTICE_MARKDOWN_TEMPLATE } from "@/lib/practice-markdown-template";
import { instantiate, parseOriginText, practiceOriginLabel, seededRng, validatePracticeQuestion } from "@/lib/practice-template";

describe("parseOriginText", () => {
  it("recognises Πανελλαδικές however it's written, keeping the rest as the detail", () => {
    expect(parseOriginText("Πανελλαδικές 2019 · Θέμα Β")).toEqual({ origin: "panhellenic", originDetail: "2019 · Θέμα Β" });
    expect(parseOriginText("ΠΑΝΕΛΛΑΔΙΚΕΣ ΕΞΕΤΑΣΕΙΣ 2021")).toEqual({ origin: "panhellenic", originDetail: "2021" });
    expect(parseOriginText("Πανελλήνιες: 2018, Θέμα Γ")).toEqual({ origin: "panhellenic", originDetail: "2018, Θέμα Γ" });
    expect(parseOriginText("Panhellenic exams 2020")).toEqual({ origin: "panhellenic", originDetail: "2020" });
    expect(parseOriginText("Πανελλαδικές")).toEqual({ origin: "panhellenic", originDetail: null });
  });

  it("recognises the school textbook", () => {
    expect(parseOriginText("Σχολικό βιβλίο σελ. 45, άσκ. 3")).toEqual({ origin: "textbook", originDetail: "σελ. 45, άσκ. 3" });
    expect(parseOriginText("σχολικο βιβλιο")).toEqual({ origin: "textbook", originDetail: null });
    expect(parseOriginText("Textbook - p. 12")).toEqual({ origin: "textbook", originDetail: "p. 12" });
  });

  it("takes anything else as a custom source's name", () => {
    expect(parseOriginText("Μαθηματική Εταιρεία")).toEqual({ origin: "custom", originDetail: "Μαθηματική Εταιρεία" });
    // Only a whole word counts: "Βιβλιοθήκη" isn't the textbook.
    expect(parseOriginText("Βιβλιοθήκη Ασκήσεων")).toEqual({ origin: "custom", originDetail: "Βιβλιοθήκη Ασκήσεων" });
    expect(parseOriginText("   ")).toEqual({ origin: null, originDetail: null });
    expect(parseOriginText(null)).toEqual({ origin: null, originDetail: null });
  });
});

describe("practiceOriginLabel", () => {
  it("is what students see", () => {
    expect(practiceOriginLabel("panhellenic", "2019 · Θέμα Β")).toBe("Πανελλαδικές · 2019 · Θέμα Β");
    expect(practiceOriginLabel("textbook", null)).toBe("Σχολικό βιβλίο");
    expect(practiceOriginLabel("textbook", "  ")).toBe("Σχολικό βιβλίο");
    expect(practiceOriginLabel("custom", "Μαθηματική Εταιρεία")).toBe("Μαθηματική Εταιρεία");
    expect(practiceOriginLabel(null, "2019")).toBeNull();
    expect(practiceOriginLabel(undefined, undefined)).toBeNull();
  });

  it("travels with the played question", () => {
    const played = instantiate({ type: "number", prompt: "$2 + 2$", answer: "4", origin: "panhellenic", originDetail: "2019" }, seededRng(1));
    expect(played.originLabel).toBe("Πανελλαδικές · 2019");
    expect(instantiate({ type: "number", prompt: "$2 + 2$", answer: "4" }, seededRng(1)).originLabel).toBeNull();
  });
});

describe("source checks", () => {
  const base = { type: "number" as const, prompt: "$2 + 2$", answer: "4" };
  it("needs a name for a custom source, keeps details short, knows only the three kinds", () => {
    expect(validatePracticeQuestion({ ...base, origin: "custom", originDetail: " " })).toContain("Name the source");
    expect(validatePracticeQuestion({ ...base, origin: "textbook", originDetail: "x".repeat(121) })[0]).toMatch(/too long/);
    expect(validatePracticeQuestion({ ...base, origin: "exam" as never })).toContain("Unknown source");
    expect(validatePracticeQuestion({ ...base, origin: "panhellenic", originDetail: null })).toEqual([]);
  });
});

describe("Source: in the Markdown format", () => {
  it("reads Source: and Πηγή:, and leaves questions without one unlabelled", () => {
    const parsed = parsePracticeMarkdown(`
## $2 + 2$ = ;
Answer: 4
Source: Πανελλαδικές 2019 · Θέμα Β

## $3 + 3$ = ;
Answer: 6
Πηγή: Μαθηματική Εταιρεία

## $4 + 4$ = ;
Answer: 8
`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions.map((q) => [q.origin ?? null, q.originDetail ?? null])).toEqual([
      ["panhellenic", "2019 · Θέμα Β"],
      ["custom", "Μαθηματική Εταιρεία"],
      [null, null],
    ]);
  });

  it("shows the template's own example", () => {
    const parsed = parsePracticeMarkdown(PRACTICE_MARKDOWN_TEMPLATE);
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions.filter((q) => q.origin).map((q) => q.origin)).toEqual(["textbook"]);
  });
});
