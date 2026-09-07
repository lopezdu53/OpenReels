import { describe, expect, it, vi } from "vitest";
import { research } from "./research.js";
import type { LLMProvider } from "../schema/providers.js";

const FACTS = {
  summary: "A researched summary",
  key_facts: ["Fact one", "Fact two"],
  mood: "curious",
  sources: ["https://example.com"],
};

describe("research", () => {
  it("uses web search on the first attempt", async () => {
    const generate = vi.fn().mockResolvedValue({
      data: FACTS,
      usage: { inputTokens: 10, outputTokens: 20 },
    });
    const llm = { id: "gemini" as const, generate };

    const out = await research(llm, "black holes");
    expect(out.data.key_facts).toEqual(["Fact one", "Fact two"]);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![0].enableWebSearch).toBe(true);
  });

  it("retries without web search when search fails instead of returning empty facts", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("web search failed: 403"))
      .mockResolvedValueOnce({
        data: FACTS,
        usage: { inputTokens: 5, outputTokens: 8 },
      });
    const llm: LLMProvider = { id: "gemini", generate };

    const out = await research(llm, "black holes");
    expect(out.data.key_facts).toHaveLength(2);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]![0].enableWebSearch).toBe(true);
    expect(generate.mock.calls[1]![0].enableWebSearch).toBe(false);
    expect(generate.mock.calls[1]![0].systemPrompt).toContain("You do not have access to web search");
  });

  it("propagates the parametric error when both attempts fail", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error("search down"))
      .mockRejectedValueOnce(new Error("parametric also failed"));
    const llm: LLMProvider = { id: "gemini", generate };

    await expect(research(llm, "topic")).rejects.toThrow("parametric also failed");
  });
});
