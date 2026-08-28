import { describe, it, expect } from "vitest";
import { parseQuizMarkdown } from "@/lib/quiz-markdown";
import { QUIZ_MARKDOWN_TEMPLATE } from "@/lib/quiz-markdown-template";

describe("QUIZ_MARKDOWN_TEMPLATE", () => {
  it("parses without errors, as-is, via the same importer teachers use", () => {
    const result = parseQuizMarkdown(QUIZ_MARKDOWN_TEMPLATE);

    expect(result.title).toBe("Chapter 3 Quiz: Derivatives");
    expect(result.timeLimitMinutes).toBe(20);
    expect(result.questions).toHaveLength(3);
    expect(result.questions.map((q) => q.questionType)).toEqual([
      "multiple_choice",
      "true_false",
      "short_answer",
    ]);
  });

  it("keeps its instructional comment out of the parsed description", () => {
    const result = parseQuizMarkdown(QUIZ_MARKDOWN_TEMPLATE);

    expect(result.description).not.toMatch(/MODUS QUIZ IMPORT TEMPLATE/);
    expect(result.description).toBe(
      "Covers limits, derivative rules, and basic applications.",
    );
  });
});
