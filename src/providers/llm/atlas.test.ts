import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AtlasLLM } from "./atlas.js";

const mockProvider = vi.fn((model: string) => ({ model, type: "atlas-model" }));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => mockProvider),
}));

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

describe("AtlasLLM", () => {
  const origKey = process.env["ATLASCLOUD_API_KEY"];

  beforeEach(() => {
    process.env["ATLASCLOUD_API_KEY"] = "test-atlas-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (origKey !== undefined) process.env["ATLASCLOUD_API_KEY"] = origKey;
    else delete process.env["ATLASCLOUD_API_KEY"];
  });

  it("has id atlas", () => {
    expect(new AtlasLLM().id).toBe("atlas");
  });

  it("throws without ATLASCLOUD_API_KEY", () => {
    delete process.env["ATLASCLOUD_API_KEY"];
    expect(() => new AtlasLLM()).toThrow("ATLASCLOUD_API_KEY");
  });

  it("points at api.atlascloud.ai with DeepSeek V4 Flash", () => {
    const llm = new AtlasLLM();
    expect(createOpenAICompatible).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "atlascloud",
        baseURL: "https://api.atlascloud.ai/v1",
        apiKey: "test-atlas-key",
      }),
    );
    (llm as unknown as { createLanguageModel: () => unknown }).createLanguageModel();
    expect(mockProvider).toHaveBeenCalledWith("deepseek-ai/deepseek-v4-flash");
  });

  it("honors model override", () => {
    const llm = new AtlasLLM("qwen/qwen3.5-flash", "custom-key");
    (llm as unknown as { createLanguageModel: () => unknown }).createLanguageModel();
    expect(mockProvider).toHaveBeenCalledWith("qwen/qwen3.5-flash");
    expect(createOpenAICompatible).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "custom-key" }));
  });
});
