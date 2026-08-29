import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/anthropic-client";

export interface ShortAnswerGradingInput {
  questionText: string;
  modelAnswer: string | null;
  textAnswer: string;
  points: number;
}

export interface ShortAnswerGradingResult {
  isCorrect: boolean;
  reasoning: string;
}

const SYSTEM_PROMPT = `You grade a single short-answer response for a Greek tutoring center's quiz. Judge correctness on substance, not exact wording - accept equivalent valid phrasing, minor typos/spelling, and mathematically equivalent forms of a numeric or symbolic answer.

When a model answer is provided, grade strictly against what it actually requires - never invent a stricter standard than it implies. When no model answer is provided, judge from the question text and your own subject-matter knowledge, and use the reasoning field to flag genuine ambiguity rather than guessing with unwarranted confidence.

Always write the reasoning field in Greek (στα Ελληνικά), regardless of what language the question/answer are in - it's read by a Greek-speaking teacher. When the reasoning involves math, write it using LaTeX ($...$ for inline, $$...$$ for display) - the app renders it with KaTeX, same as question and answer text everywhere else in this quiz feature.

Always call submit_grade with your verdict.`;

const GRADE_TOOL: Anthropic.Tool = {
  name: "submit_grade",
  description: "Submit the grading verdict for this short-answer response.",
  input_schema: {
    type: "object",
    properties: {
      is_correct: {
        type: "boolean",
        description: "Whether the student's answer is correct.",
      },
      reasoning: {
        type: "string",
        description:
          "One or two sentences in Greek explaining the verdict, for a teacher reviewing it. Use $...$/$$...$$ LaTeX for any math.",
      },
    },
    required: ["is_correct", "reasoning"],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * Grades one short-answer quiz response with Claude. Never throws - a
 * missing API key, API error, or an unparseable response all return null,
 * which callers treat as "leave this ungraded" (the existing manual-
 * grading queue is the fallback, not a broken submission).
 */
export async function gradeShortAnswerWithAI(
  input: ShortAnswerGradingInput,
): Promise<ShortAnswerGradingResult | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return null;
  }

  const userPrompt = [
    `Question: ${input.questionText}`,
    input.modelAnswer
      ? `Model answer: ${input.modelAnswer}`
      : "Model answer: (none provided - use your own judgment)",
    `Points available: ${input.points}`,
    `Student's answer: ${input.textAnswer}`,
  ].join("\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      tools: [GRADE_TOOL],
      tool_choice: { type: "tool", name: "submit_grade" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      return null;
    }

    const toolInput = toolUse.input as {
      is_correct?: unknown;
      reasoning?: unknown;
    };
    if (
      typeof toolInput.is_correct !== "boolean" ||
      typeof toolInput.reasoning !== "string"
    ) {
      return null;
    }

    return { isCorrect: toolInput.is_correct, reasoning: toolInput.reasoning };
  } catch (error) {
    console.error("AI short-answer grading failed:", error);
    return null;
  }
}
