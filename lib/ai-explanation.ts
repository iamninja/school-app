import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/anthropic-client";

export interface WrongAnswerExplanationInput {
  questionText: string;
  correctAnswerText: string;
  selectedAnswerText: string;
}

const SYSTEM_PROMPT = `You write a short explanation of why the correct answer to a multiple-choice or true/false quiz question is correct, for a student at a Greek tutoring center who answered it wrong. Ground the explanation in the specific question and correct answer given - don't introduce anything beyond what's needed to justify it. Keep it to one or two sentences, clear and encouraging, never condescending.

Always write the explanation in Greek (στα Ελληνικά). When math is involved, use LaTeX ($...$ for inline, $$...$$ for display) - the app renders it with KaTeX, same as everywhere else in this quiz feature.

Always call submit_explanation with your explanation.`;

const EXPLANATION_TOOL: Anthropic.Tool = {
  name: "submit_explanation",
  description:
    "Submit the explanation for why the correct answer is correct.",
  input_schema: {
    type: "object",
    properties: {
      explanation: {
        type: "string",
        description:
          "One or two sentences in Greek explaining why the correct answer is correct. Use $...$/$$...$$ LaTeX for any math.",
      },
    },
    required: ["explanation"],
    additionalProperties: false,
  },
  strict: true,
};

/**
 * Explains why the correct answer to a closed-type (multiple-choice/
 * true-false) question is correct, for a student who got it wrong. Never
 * throws - a missing API key, API error, or unparseable response all
 * return null, which callers treat as "no explanation available" (the
 * review just doesn't show one, same as before this feature existed).
 */
export async function explainWrongAnswer(
  input: WrongAnswerExplanationInput,
): Promise<string | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) {
    return null;
  }

  const userPrompt = [
    `Question: ${input.questionText}`,
    `Correct answer: ${input.correctAnswerText}`,
    `Student selected: ${input.selectedAnswerText}`,
  ].join("\n\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" },
      tools: [EXPLANATION_TOOL],
      tool_choice: { type: "tool", name: "submit_explanation" },
      messages: [{ role: "user", content: userPrompt }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUse) {
      return null;
    }

    const toolInput = toolUse.input as { explanation?: unknown };
    if (typeof toolInput.explanation !== "string") {
      return null;
    }

    return toolInput.explanation;
  } catch (error) {
    console.error("AI wrong-answer explanation failed:", error);
    return null;
  }
}
