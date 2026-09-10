import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrokLLM } from "./grok.js";

const mockProvider = vi.fn((model: string) => ({ model, type: "grok-model" }));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => mockProvider),
}));

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

describe("GrokLLM", () => {
  const origKey = process.env["XAI_API_KEY"];

  beforeEach(() => {
    process.env["XAI_API_KEY"] = "test-xai-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (origKey !== undefined) process.env["XAI_API_KEY"] = origKey;
    else delete process.env["XAI_API_KEY"];
  });

  it("has id grok", () => {
    expect(new GrokLLM().id).toBe("grok");
  });

  it("throws without XAI_API_KEY", () => {
    delete process.env["XAI_API_KEY"];
    expect(() => new GrokLLM()).toThrow("XAI_API_KEY environment variable is required");
  });

  it("points at api.x.ai with default grok-4", () => {
    const llm = new GrokLLM();
    expect(createOpenAICompatible).toHaveBeenCalledWith({
      name: "grok",
      baseURL: "https://api.x.ai/v1",
      apiKey: "test-xai-key",
    });
    (llm as unknown as { createLanguageModel: () => unknown }).createLanguageModel();
    expect(mockProvider).toHaveBeenCalledWith("grok-4");
  });

  it("honors model override", () => {
    const llm = new GrokLLM("grok-4.6", "custom-key");
    (llm as unknown as { createLanguageModel: () => unknown }).createLanguageModel();
    expect(mockProvider).toHaveBeenCalledWith("grok-4.6");
    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "custom-key" }),
    );
  });

  it("has no native search tools", () => {
    const llm = new GrokLLM();
    expect(
      (llm as unknown as { createSearchTools: () => Record<string, unknown> }).createSearchTools(),
    ).toEqual({});
  });
});
