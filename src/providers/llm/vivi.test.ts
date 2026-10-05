import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_VIVI_LLM_MODEL, resolveViviLlmModel, ViviLLM } from "./vivi.js";

const mockProvider = vi.fn((model: string) => ({ model, type: "vivi-model" }));

vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: vi.fn(() => mockProvider),
}));

describe("resolveViviLlmModel", () => {
  it("defaults to Claude Sonnet in the VIVI Claude group", () => {
    expect(resolveViviLlmModel()).toBe(DEFAULT_VIVI_LLM_MODEL);
    expect(resolveViviLlmModel("")).toBe("claude-sonnet-4-6");
    expect(resolveViviLlmModel("  claude-opus-4-6  ")).toBe("claude-opus-4-6");
  });

  it("drops Atlas catalog ids that leak from Film/Flow form state", () => {
    expect(resolveViviLlmModel("deepseek-ai/deepseek-v4-flash")).toBe("claude-sonnet-4-6");
    expect(resolveViviLlmModel("qwen/qwen3.5-flash")).toBe("claude-sonnet-4-6");
    expect(resolveViviLlmModel("deepseek-v4-flash")).toBe("claude-sonnet-4-6");
  });
});

describe("ViviLLM", () => {
  const origKey = process.env["VIVI_LLM_API_KEY"];

  beforeEach(() => {
    process.env["VIVI_LLM_API_KEY"] = "test-vivi-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (origKey !== undefined) process.env["VIVI_LLM_API_KEY"] = origKey;
    else delete process.env["VIVI_LLM_API_KEY"];
  });

  it("uses Claude when the UI sent the Atlas default model", () => {
    const llm = new ViviLLM("deepseek-ai/deepseek-v4-flash");
    (llm as unknown as { createLanguageModel: () => unknown }).createLanguageModel();
    expect(mockProvider).toHaveBeenCalledWith("claude-sonnet-4-6");
  });
});
