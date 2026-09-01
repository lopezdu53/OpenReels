import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mockProvider = vi.fn((model: string) => ({ model, type: "alicloud-model" }));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => mockProvider),
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  Output: {},
  stepCountIs: () => 5,
}));

import { generateText } from "ai";
import { AliCloudLLM, DEFAULT_MODEL, FALLBACK_MODELS, isAliCloudAccessDenied } from "./alicloud.js";

describe("AliCloudLLM", () => {
  const origKey = process.env["ALICLOUD_API_KEY"];

  beforeEach(() => {
    process.env["ALICLOUD_API_KEY"] = "test-ali-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (origKey !== undefined) process.env["ALICLOUD_API_KEY"] = origKey;
    else delete process.env["ALICLOUD_API_KEY"];
  });

  it("has id alicloud", () => {
    expect(new AliCloudLLM().id).toBe("alicloud");
  });

  it("throws without ALICLOUD_API_KEY", () => {
    delete process.env["ALICLOUD_API_KEY"];
    expect(() => new AliCloudLLM()).toThrow("ALICLOUD_API_KEY environment variable is required");
  });

  it("defaults to qwen3.6-flash", () => {
    const llm = new AliCloudLLM();
    expect(llm.modelId).toBe("qwen3.6-flash");
    expect(DEFAULT_MODEL).toBe("qwen3.6-flash");
    (llm as unknown as { createLanguageModel: () => unknown }).createLanguageModel();
    expect(mockProvider).toHaveBeenCalledWith("qwen3.6-flash");
  });

  it("honors model override", () => {
    const llm = new AliCloudLLM("qwen3.6-plus", "custom-key");
    expect(llm.modelId).toBe("qwen3.6-plus");
  });

  it("detects access-denied errors", () => {
    expect(isAliCloudAccessDenied(new Error("Access to model denied"))).toBe(true);
    expect(isAliCloudAccessDenied(new Error("rate limited"))).toBe(false);
  });

  it("retries generateStructured on access denied with fallback models", async () => {
    const generateTextMock = vi.mocked(generateText);
    generateTextMock
      .mockRejectedValueOnce(new Error("Access to model denied"))
      .mockResolvedValueOnce({
        text: '{"ok":true}',
        usage: { inputTokens: 1, outputTokens: 2 },
      } as never);

    const llm = new AliCloudLLM("qwen3.7-max");
    const schema = z.object({ ok: z.boolean() });
    const result = await llm.generate({
      systemPrompt: "sys",
      userMessage: "hi",
      schema,
      enableWebSearch: false,
    });

    expect(result.data.ok).toBe(true);
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(llm.modelId).toBe(FALLBACK_MODELS[0]);
  });
});
