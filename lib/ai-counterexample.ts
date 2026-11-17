import "server-only";
import { getAnthropicClient } from "@/lib/anthropic-client";

/** What the AI made of a typed counterexample. */
export type AiCounterexampleVerdict = "valid" | "hypothesis_fails" | "conclusion_holds" | "invalid";
export const AI_COUNTEREXAMPLE_VERDICTS: AiCounterexampleVerdict[] = ["valid", "hypothesis_fails", "conclusion_holds", "invalid"];

export interface AiCounterexampleInput {
  /** The claim, as the student saw it ("Ο ισχυρισμός «...»"). */
  claim: string;
  /** What the student typed, normalised ("abs(x)"), and its point if the question has one. */
  typed: string;
  x0: string | null;
  /** The teacher's options with their markers and reasons - a reference, not the answer key for this function. */
  options: { text: string; marker: string; reason: string | null }[];
  explanation: string | null;
}

export interface AiCounterexampleResult {
  verdict: AiCounterexampleVerdict;
  reason: string;
}

const SYSTEM_PROMPT = `You check a counterexample that a Greek secondary-school student (Γ Λυκείου, calculus) typed for a false mathematical claim.

A function is a counterexample when it satisfies every hypothesis of the claim (at the given point x₀, if there is one) and the conclusion fails for it. Judge exactly that, with the school-book definitions (continuity, differentiability, monotonicity, convexity, limits as in the Greek Γ Λυκείου textbook):
- "valid": every hypothesis holds and the conclusion fails.
- "hypothesis_fails": at least one hypothesis does not hold (e.g. the function is not defined, not continuous, not differentiable, not increasing where the claim requires it). Takes precedence over conclusion_holds.
- "conclusion_holds": the hypotheses hold but so does the conclusion, so it doesn't refute the claim.
- "invalid": it isn't a function of x, can't be read, or doesn't fit the claim's form (e.g. a number where a function is needed).

The teacher's options and reasons are given as reference for how the claim is meant; the student's function may be different from all of them and still be valid. Check carefully - a student loses or wins points on your verdict. If the claim needs a point and the student gave one, judge at that point.

reason: one or two short sentences in Greek, addressed to the student (second person singular), saying why. Put mathematics in LaTeX between single dollar signs ($f'(0) = 0$). No preamble.`;

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: AI_COUNTEREXAMPLE_VERDICTS },
    reason: { type: "string" },
  },
  required: ["verdict", "reason"],
  additionalProperties: false,
} as const;

const MARKERS: Record<string, string> = {
  x: "the counterexample",
  h: "hypothesis fails",
  c: "conclusion holds",
  "": "wrong for another reason",
};

/**
 * Asks Claude whether a typed counterexample refutes the claim. Never
 * throws: no API key, an API error, a refusal or an unreadable answer all
 * return null, and the game falls back to the options.
 */
export async function judgeCounterexampleWithAI(input: AiCounterexampleInput): Promise<AiCounterexampleResult | null> {
  const anthropic = getAnthropicClient();
  if (!anthropic) return null;

  const prompt = [
    `Claim: ${input.claim}`,
    "Teacher's options (reference):",
    ...input.options.map((option) => `- ${option.text} [${MARKERS[option.marker] ?? MARKERS[""]}]${option.reason ? ` - ${option.reason}` : ""}`),
    input.explanation ? `Teacher's explanation: ${input.explanation}` : "",
    `Student's counterexample: f(x) = ${input.typed}${input.x0 !== null ? `, at x₀ = ${input.x0}` : ""}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const response = await anthropic.beta.messages.create(
      {
        model: "claude-opus-5-5",
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content: prompt }],
      },
      { timeout: 25_000, maxRetries: 1 },
    );
    if (response.stop_reason === "refusal") return null;
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const parsed = JSON.parse(text) as { verdict?: unknown; reason?: unknown };
    if (!AI_COUNTEREXAMPLE_VERDICTS.includes(parsed.verdict as AiCounterexampleVerdict) || typeof parsed.reason !== "string") return null;
    return { verdict: parsed.verdict as AiCounterexampleVerdict, reason: parsed.reason.trim().slice(0, 600) };
  } catch (error) {
    console.error("AI counterexample check failed:", error);
    return null;
  }
}
