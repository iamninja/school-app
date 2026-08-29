import "server-only";
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null | undefined;

/**
 * Lazily-constructed singleton, shared by every AI feature in this app
 * (short-answer grading, wrong-answer explanations, ...) so there's one
 * client instance and one place that reads ANTHROPIC_API_KEY.
 */
export function getAnthropicClient(): Anthropic | null {
  if (client === undefined) {
    client = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
  }
  return client;
}
