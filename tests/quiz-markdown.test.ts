import { describe, it, expect } from "vitest";
import {
  parseQuizMarkdown,
  QuizMarkdownParseError,
} from "@/lib/quiz-markdown";

describe("parseQuizMarkdown", () => {
  it("parses title, description, and time limit", () => {
    const result = parseQuizMarkdown(
      [
        "# Chapter 3 Quiz",
        "",
        "Covers derivatives and limits.",
        "",
        "Time limit: 20",
        "",
        "## What is $2+2$? {points=2}",
        "- [ ] 3",
        "- [x] 4",
      ].join("\n"),
    );

    expect(result.title).toBe("Chapter 3 Quiz");
    expect(result.description).toBe("Covers derivatives and limits.");
    expect(result.timeLimitMinutes).toBe(20);
    expect(result.questions).toHaveLength(1);
  });

  it("has no description or time limit when neither is present", () => {
    const result = parseQuizMarkdown(
      ["# Quiz", "", "## Q1", "- [ ] a", "- [x] b"].join("\n"),
    );
    expect(result.description).toBeUndefined();
    expect(result.timeLimitMinutes).toBeUndefined();
  });

  it("parses a multiple_choice question, defaulting type and points", () => {
    const result = parseQuizMarkdown(
      ["# Quiz", "## What is 2+2?", "- [ ] 3", "- [x] 4", "- [ ] 5"].join(
        "\n",
      ),
    );
    expect(result.questions[0]).toEqual({
      questionText: "What is 2+2?",
      questionType: "multiple_choice",
      points: 1,
      options: [
        { optionText: "3", isCorrect: false },
        { optionText: "4", isCorrect: true },
        { optionText: "5", isCorrect: false },
      ],
      imagePath: null,
    });
  });

  it("parses a true_false question with an explicit points attribute", () => {
    const result = parseQuizMarkdown(
      [
        "# Quiz",
        "## Is 7 a prime number? {type=true_false, points=3}",
        "Answer: True",
      ].join("\n"),
    );
    expect(result.questions[0]).toEqual({
      questionText: "Is 7 a prime number?",
      questionType: "true_false",
      points: 3,
      options: [
        { optionText: "True", isCorrect: true },
        { optionText: "False", isCorrect: false },
      ],
      imagePath: null,
    });
  });

  it("parses Answer: False case-insensitively", () => {
    const result = parseQuizMarkdown(
      ["# Quiz", "## Statement {type=true_false}", "answer: false"].join(
        "\n",
      ),
    );
    expect(result.questions[0].options).toEqual([
      { optionText: "True", isCorrect: false },
      { optionText: "False", isCorrect: true },
    ]);
  });

  it("parses a short_answer question with no options", () => {
    const result = parseQuizMarkdown(
      ["# Quiz", "## Explain the chain rule. {type=short_answer, points=5}"].join(
        "\n",
      ),
    );
    expect(result.questions[0]).toEqual({
      questionText: "Explain the chain rule.",
      questionType: "short_answer",
      points: 5,
      options: [],
      imagePath: null,
    });
  });

  it("parses multiple questions of mixed types", () => {
    const result = parseQuizMarkdown(
      [
        "# Quiz",
        "## Q1",
        "- [x] a",
        "- [ ] b",
        "## Q2 {type=true_false}",
        "Answer: True",
        "## Q3 {type=short_answer}",
      ].join("\n"),
    );
    expect(result.questions.map((q) => q.questionType)).toEqual([
      "multiple_choice",
      "true_false",
      "short_answer",
    ]);
  });

  it("passes LaTeX delimiters through untouched", () => {
    const result = parseQuizMarkdown(
      ["# Quiz", "## Solve $x^2 = 4$", "- [x] $x = \\pm 2$", "- [ ] $x = 4$"].join(
        "\n",
      ),
    );
    expect(result.questions[0].questionText).toBe("Solve $x^2 = 4$");
    expect(result.questions[0].options[0].optionText).toBe("$x = \\pm 2$");
  });

  it("throws when there is no title", () => {
    expect(() => parseQuizMarkdown("## Q1\n- [x] a\n- [ ] b")).toThrow(
      QuizMarkdownParseError,
    );
  });

  it("throws when there are no questions", () => {
    expect(() => parseQuizMarkdown("# Quiz\n\nJust a description.")).toThrow(
      /No questions found/,
    );
  });

  it("throws when a multiple_choice question has fewer than 2 options", () => {
    expect(() =>
      parseQuizMarkdown("# Quiz\n## Q1\n- [x] only one"),
    ).toThrow(/at least 2 options/);
  });

  it("throws when a multiple_choice question has no correct option marked", () => {
    expect(() =>
      parseQuizMarkdown("# Quiz\n## Q1\n- [ ] a\n- [ ] b"),
    ).toThrow(/exactly one correct option/);
  });

  it("throws when a multiple_choice question has more than one correct option", () => {
    expect(() =>
      parseQuizMarkdown("# Quiz\n## Q1\n- [x] a\n- [x] b"),
    ).toThrow(/exactly one correct option/);
  });

  it("throws when a true_false question has no Answer line", () => {
    expect(() =>
      parseQuizMarkdown("# Quiz\n## Q1 {type=true_false}"),
    ).toThrow(/need an "Answer: True" or "Answer: False" line/);
  });

  it("throws on an unknown type attribute", () => {
    expect(() =>
      parseQuizMarkdown("# Quiz\n## Q1 {type=essay}\n- [x] a\n- [ ] b"),
    ).toThrow(/unknown type "essay"/);
  });

  it("throws on a non-positive points attribute", () => {
    expect(() =>
      parseQuizMarkdown("# Quiz\n## Q1 {points=0}\n- [x] a\n- [ ] b"),
    ).toThrow(/points must be a positive number/);
  });

  it("collects errors from multiple questions into one thrown error", () => {
    try {
      parseQuizMarkdown(
        [
          "# Quiz",
          "## Q1",
          "- [ ] only one option",
          "## Q2 {type=true_false}",
        ].join("\n"),
      );
      expect.fail("expected parseQuizMarkdown to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(QuizMarkdownParseError);
      const message = (error as Error).message;
      expect(message).toMatch(/Question 1/);
      expect(message).toMatch(/Question 2/);
    }
  });
});
