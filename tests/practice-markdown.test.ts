import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parsePracticeMarkdown } from "@/lib/practice-markdown";
import { PRACTICE_MARKDOWN_TEMPLATE } from "@/lib/practice-markdown-template";
import { instantiate, isCorrect, seededRng } from "@/lib/practice-template";

describe("the practice template", () => {
  it("is the same as docs/practice-questions.md", () => {
    const docs = readFileSync(path.join(process.cwd(), "docs", "practice-questions.md"), "utf8");
    expect(docs).toBe(PRACTICE_MARKDOWN_TEMPLATE);
  });

  it("imports cleanly: every example is a valid question", () => {
    const parsed = parsePracticeMarkdown(PRACTICE_MARKDOWN_TEMPLATE);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sectionName).toBe("Η ευθεία");
    expect(parsed.questions.map((q) => q.type)).toEqual([
      "choice", "true_false", "number", "choice", "slider", "point", "point", "counterexample",
    ]);
  });

  it("plays its templates with consistent answers", () => {
    const parsed = parsePracticeMarkdown(PRACTICE_MARKDOWN_TEMPLATE);
    const rng = seededRng(99);
    const intersection = parsed.questions[5];
    for (let i = 0; i < 30; i++) {
      const played = instantiate(intersection, rng);
      // The answer lies on both drawn lines.
      const [p, q] = played.graph!.plots.map((plot) => plot);
      expect(p).toMatch(/^x \+ \(-?\d\)$/);
      expect(q).toMatch(/^-x \+ \(-?\d\)$/);
      expect(isCorrect(played, { x: played.answer, y: played.answerY })).toBe(true);
    }
    const slope = parsed.questions[3];
    for (let i = 0; i < 30; i++) {
      const played = instantiate(slope, rng);
      expect(played.options.filter((option) => option.correct)).toHaveLength(1);
      expect(played.prompt).not.toContain("{{");
    }
  });
});

describe("parsePracticeMarkdown", () => {
  it("works out each type from what's written", () => {
    const parsed = parsePracticeMarkdown(`
## Ένα;
- [x] Ναι
- [ ] Όχι

## Το 2 είναι άρτιος.
Answer: True

## $2 + 2$ = ;
Answer: 4

## Το $\\pi$;
Range: 0..5
Answer: pi
Tolerance: 0.1

## Σημείο
Answer: (1, 2)
`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sectionName).toBeNull();
    expect(parsed.questions.map((q) => q.type)).toEqual(["choice", "true_false", "number", "slider", "point"]);
    expect(parsed.questions[4].graph).toEqual({ xMin: -5, xMax: 5, yMin: -5, yMax: 5, plots: [] });
  });

  it("keeps multi-line questions and explanations", () => {
    const parsed = parsePracticeMarkdown(`# Πολυώνυμα
## Δίνεται το $P(x) = x^3 - 1$.
Ποια είναι η τιμή $P(2)$;
Answer: 7
Explanation: $P(2) = 8 - 1$.
Άρα $7$.
`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sectionName).toBe("Πολυώνυμα");
    expect(parsed.questions[0].prompt).toBe("Δίνεται το $P(x) = x^3 - 1$.\nΠοια είναι η τιμή $P(2)$;");
    expect(parsed.questions[0].explanation).toBe("$P(2) = 8 - 1$.\nΆρα $7$.");
  });

  it("accepts the quiz-style heading attributes but leaves LaTeX braces alone", () => {
    const parsed = parsePracticeMarkdown(`
## Λύσε $2x + 7 = 19$. {type=number, answer=6}

## Πόσο κάνει $x^{2}$ για $x = 3$;
Answer: 9
`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.questions[0]).toMatchObject({ type: "number", answer: "6", prompt: "Λύσε $2x + 7 = 19$." });
    expect(parsed.questions[1].prompt).toBe("Πόσο κάνει $x^{2}$ για $x = 3$;");
  });

  it("ignores comments and the template's instructions", () => {
    const parsed = parsePracticeMarkdown(`<!-- ## not a question
Answer: 1 -->
## Real
Answer: 1
`);
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.errors).toEqual([]);
  });

  it("reports every problem with the question it belongs to", () => {
    const parsed = parsePracticeMarkdown(`
## Δύο σωστές
- [x] α
- [x] β

## Χωρίς απάντηση
Type: number

## Αγνώστου τύπου
Type: essay
Answer: 1

## Slider χωρίς εύρος
Type: slider
Answer: 3

## Περίεργη γραμμή
Answer: 2
blah blah

## Πρότυπο που δε βγαίνει
Answer: a
Variables: a=1..3
Condition: a > 10
`);
    expect(parsed.errors).toEqual([
      'Question 1 "Δύο σωστές": needs exactly one correct option "- [x]" (found 2)',
      'Question 2 "Χωρίς απάντηση": needs an "Answer:" line',
      'Question 3 "Αγνώστου τύπου": unknown type "essay" (use choice, true_false, number, slider, point or counterexample)',
      'Question 4 "Slider χωρίς εύρος": a slider needs "Range: 0..10"',
      'Question 5 "Περίεργη γραμμή": didn\'t understand "blah blah" (options start with "- [ ]", settings with "Answer:", "Range:"…)',
      'Question 6 "Πρότυπο που δε βγαίνει": No numbers met the condition - check it and the ranges',
    ]);
  });

  it("says so when there are no questions", () => {
    expect(parsePracticeMarkdown("# Μόνο τίτλος").errors[0]).toMatch(/No questions found/);
  });
});

describe("several sections in one file", () => {
  it("puts each question under the # heading above it", () => {
    const parsed = parsePracticeMarkdown(`# 1.1 Συνάρτηση

## $2 + 2$ = ;
Answer: 4

## $3 + 3$ = ;
Answer: 6

# 1.2 Γραφική παράσταση

## $4 + 4$ = ;
Answer: 8
Explanation: Απλή πρόσθεση.

# 1.1 Συνάρτηση

## $5 + 5$ = ;
Answer: 10
`);
    expect(parsed.errors).toEqual([]);
    expect(parsed.sectionName).toBe("1.1 Συνάρτηση");
    expect(parsed.sectionNames).toEqual(["1.1 Συνάρτηση", "1.1 Συνάρτηση", "1.2 Γραφική παράσταση", "1.1 Συνάρτηση"]);
    // A heading ends the question above it - it isn't read as part of its explanation.
    expect(parsed.questions[2].explanation).toBe("Απλή πρόσθεση.");
    expect(parsed.questions[1].prompt).toBe("$3 + 3$ = ;");
  });

  it("leaves questions before any heading without a section", () => {
    const parsed = parsePracticeMarkdown("## $1 + 1$ = ;\nAnswer: 2\n\n# Β\n\n## $2 + 2$ = ;\nAnswer: 4\n");
    expect(parsed.sectionNames).toEqual([null, "Β"]);
    expect(parsed.sectionName).toBeNull();
  });
});
