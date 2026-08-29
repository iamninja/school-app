import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function AnthropicMock() {
    return { messages: { create: mockCreate } };
  }),
}));

const ORIGINAL_API_KEY = process.env.ANTHROPIC_API_KEY;

// lib/anthropic-client.ts caches its client in a module-level variable on
// first use, so each test needs a fresh module instance to see a
// different ANTHROPIC_API_KEY value.
async function importFresh() {
  vi.resetModules();
  return import("@/lib/ai-explanation");
}

describe("explainWrongAnswer", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_API_KEY === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = ORIGINAL_API_KEY;
    }
  });

  it("returns null without calling the API when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const { explainWrongAnswer } = await importFresh();

    const result = await explainWrongAnswer({
      questionText: "2 + 2 = ?",
      correctAnswerText: "4",
      selectedAnswerText: "5",
    });

    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns the explanation from a successful tool-use response", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "submit_explanation",
          input: { explanation: "Το 2+2 ισούται με $4$." },
        },
      ],
    });
    const { explainWrongAnswer } = await importFresh();

    const result = await explainWrongAnswer({
      questionText: "2 + 2 = ?",
      correctAnswerText: "4",
      selectedAnswerText: "5",
    });

    expect(result).toBe("Το 2+2 ισούται με $4$.");
  });

  it("returns null when the API call throws", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockRejectedValue(new Error("network error"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { explainWrongAnswer } = await importFresh();

    const result = await explainWrongAnswer({
      questionText: "2 + 2 = ?",
      correctAnswerText: "4",
      selectedAnswerText: "5",
    });

    expect(result).toBeNull();
  });

  it("returns null when the response has no tool_use block", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({ content: [{ type: "text", text: "oops" }] });
    const { explainWrongAnswer } = await importFresh();

    const result = await explainWrongAnswer({
      questionText: "2 + 2 = ?",
      correctAnswerText: "4",
      selectedAnswerText: "5",
    });

    expect(result).toBeNull();
  });

  it("returns null when the tool input is malformed", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      content: [
        { type: "tool_use", name: "submit_explanation", input: { explanation: 42 } },
      ],
    });
    const { explainWrongAnswer } = await importFresh();

    const result = await explainWrongAnswer({
      questionText: "2 + 2 = ?",
      correctAnswerText: "4",
      selectedAnswerText: "5",
    });

    expect(result).toBeNull();
  });
});
