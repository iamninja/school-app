import type { QuizQuestionInput, QuizQuestionType } from "@/lib/types/database";

export class QuizMarkdownParseError extends Error {}

export interface ParsedQuizMarkdown {
  title: string;
  description?: string;
  timeLimitMinutes?: number;
  questions: QuizQuestionInput[];
}

const QUESTION_TYPES: QuizQuestionType[] = [
  "multiple_choice",
  "true_false",
  "short_answer",
];

/**
 * Parses a quiz authored in the app's Markdown convention:
 *
 * # Quiz Title
 *
 * Optional description text.
 *
 * Time limit: 20
 *
 * ## What is $2+2$? {points=2}
 * - [ ] 3
 * - [x] 4
 *
 * ## Is 7 a prime number? {type=true_false}
 * Answer: True
 *
 * ## Explain the chain rule. {type=short_answer, points=3}
 *
 * Collects every problem found (not fail-fast) so a teacher can fix
 * everything in one edit-and-reupload cycle instead of one error at a time.
 */
export function parseQuizMarkdown(source: string): ParsedQuizMarkdown {
  const errors: string[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");

  const titleIndex = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (titleIndex === -1) {
    throw new QuizMarkdownParseError(
      'No quiz title found — start the file with a line like "# Quiz Title".',
    );
  }
  const title = lines[titleIndex].replace(/^#\s+/, "").trim();

  const questionStartIndices: number[] = [];
  for (let i = titleIndex + 1; i < lines.length; i++) {
    if (/^##\s+\S/.test(lines[i])) {
      questionStartIndices.push(i);
    }
  }

  const descriptionEnd =
    questionStartIndices.length > 0 ? questionStartIndices[0] : lines.length;
  const descriptionLines = lines.slice(titleIndex + 1, descriptionEnd);

  let timeLimitMinutes: number | undefined;
  const remainingDescriptionLines: string[] = [];
  for (const line of descriptionLines) {
    const timeLimitMatch = line.match(/^\s*time limit:\s*(\d+)\s*$/i);
    if (timeLimitMatch) {
      timeLimitMinutes = Number.parseInt(timeLimitMatch[1], 10);
      continue;
    }
    remainingDescriptionLines.push(line);
  }
  const description = remainingDescriptionLines.join("\n").trim() || undefined;

  if (questionStartIndices.length === 0) {
    errors.push(
      'No questions found — add at least one "## Question text" heading.',
    );
  }

  const questions: QuizQuestionInput[] = [];

  questionStartIndices.forEach((startIndex, questionArrayIndex) => {
    const questionNumber = questionArrayIndex + 1;
    const endIndex =
      questionArrayIndex + 1 < questionStartIndices.length
        ? questionStartIndices[questionArrayIndex + 1]
        : lines.length;
    const headingLine = lines[startIndex].replace(/^##\s+/, "");
    const bodyLines = lines.slice(startIndex + 1, endIndex);

    const attributeMatch = headingLine.match(/^(.*?)\s*\{([^}]*)\}\s*$/);
    const questionText = (
      attributeMatch ? attributeMatch[1] : headingLine
    ).trim();
    const attributesRaw = attributeMatch ? attributeMatch[2] : "";

    const attributes = new Map<string, string>();
    for (const pair of attributesRaw.split(",")) {
      const [key, value] = pair.split("=").map((part) => part?.trim());
      if (key && value) {
        attributes.set(key.toLowerCase(), value);
      }
    }

    if (!questionText) {
      errors.push(`Question ${questionNumber}: needs question text after "##"`);
    }

    let questionType: QuizQuestionType = "multiple_choice";
    const typeAttr = attributes.get("type");
    if (typeAttr) {
      if (!QUESTION_TYPES.includes(typeAttr as QuizQuestionType)) {
        errors.push(
          `Question ${questionNumber}: unknown type "${typeAttr}" (use multiple_choice, true_false, or short_answer)`,
        );
      } else {
        questionType = typeAttr as QuizQuestionType;
      }
    }

    let points = 1;
    const pointsAttr = attributes.get("points");
    if (pointsAttr) {
      const parsedPoints = Number.parseInt(pointsAttr, 10);
      if (!Number.isFinite(parsedPoints) || parsedPoints <= 0) {
        errors.push(
          `Question ${questionNumber}: points must be a positive number`,
        );
      } else {
        points = parsedPoints;
      }
    }

    if (questionType === "multiple_choice") {
      const options: { optionText: string; isCorrect: boolean }[] = [];
      for (const line of bodyLines) {
        const optionMatch = line.match(/^\s*-\s*\[([ xX])\]\s*(.+?)\s*$/);
        if (optionMatch) {
          options.push({
            optionText: optionMatch[2],
            isCorrect: optionMatch[1].toLowerCase() === "x",
          });
        }
      }
      if (options.length < 2) {
        errors.push(
          `Question ${questionNumber}: multiple-choice questions need at least 2 options ("- [ ] text")`,
        );
      }
      const correctCount = options.filter((option) => option.isCorrect).length;
      if (correctCount !== 1) {
        errors.push(
          `Question ${questionNumber}: multiple-choice questions need exactly one correct option marked "- [x]" (found ${correctCount})`,
        );
      }
      questions.push({ questionText, questionType, points, options, imagePath: null });
    } else if (questionType === "true_false") {
      const answerMatch = bodyLines
        .map((line) => line.match(/^\s*answer:\s*(true|false)\s*$/i))
        .find((match) => match !== null);
      if (!answerMatch) {
        errors.push(
          `Question ${questionNumber}: true/false questions need an "Answer: True" or "Answer: False" line`,
        );
        questions.push({
          questionText,
          questionType,
          points,
          options: [
            { optionText: "True", isCorrect: true },
            { optionText: "False", isCorrect: false },
          ],
          imagePath: null,
        });
      } else {
        const isTrue = answerMatch[1].toLowerCase() === "true";
        questions.push({
          questionText,
          questionType,
          points,
          options: [
            { optionText: "True", isCorrect: isTrue },
            { optionText: "False", isCorrect: !isTrue },
          ],
          imagePath: null,
        });
      }
    } else {
      questions.push({
        questionText,
        questionType,
        points,
        options: [],
        imagePath: null,
      });
    }
  });

  if (errors.length > 0) {
    throw new QuizMarkdownParseError(errors.join("\n"));
  }

  return { title, description, timeLimitMinutes, questions };
}
