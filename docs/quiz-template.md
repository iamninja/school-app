<!--
  MODUS QUIZ IMPORT TEMPLATE
  ===========================
  Use this file as a starting point for writing a quiz, then use
  "Import from file" on the Quizzes tab to upload it. Everything above
  the "# Quiz Title" line (including this comment) is ignored by the
  importer, so feel free to delete this block once you're comfortable
  with the format.

  STRUCTURE
  ---------
  - The first "# Heading" line in the file is the quiz title.
  - Any text between the title and the first question becomes the quiz
    description (shown to students before they start).
  - An optional "Time limit: <minutes>" line (anywhere in that
    description block) sets the quiz's time limit.
  - Each question is a "## Question text" heading. Everything below a
    question heading, up to the next "##" heading, is that question's
    body.
  - Question headings can carry attributes in curly braces:
      ## Question text {type=..., points=...}
    - type: multiple_choice (default), true_false, or short_answer
    - points: a positive whole number (default: 1)
  - Wrap math in single "$...$" for inline LaTeX, e.g. $x^2 + 1$.

  QUESTION TYPES
  --------------
  multiple_choice (default type):
    List options as "- [ ] option text", marking the single correct one
    "- [x] option text". Needs at least 2 options and exactly one
    marked correct.

  true_false:
    Add a line "Answer: True" or "Answer: False" in the body.

  short_answer:
    No options or answer line needed — these are graded by hand after
    a student submits.

  VALIDATION
  ----------
  The importer checks the whole file and reports every problem it finds
  at once, so fix everything and re-upload rather than fixing one error
  at a time.
-->

# Chapter 3 Quiz: Derivatives

Covers limits, derivative rules, and basic applications.

Time limit: 20

## What is the derivative of $x^2$? {points=2}
- [ ] $x$
- [x] $2x$
- [ ] $2x^2$
- [ ] $x^2$

## The derivative of a constant is always 0. {type=true_false}
Answer: True

## Explain, in your own words, what a derivative represents. {type=short_answer, points=3}
