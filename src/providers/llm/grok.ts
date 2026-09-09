import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { BaseLLM } from "./base.js";

const XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-4";

/**
 * xAI Grok LLM via the OpenAI-compatible Chat Completions endpoint.
 * Uses Tavily (injected) for web search — Grok native search lives on the
 * Responses API, which BaseLLM does not call.
 */
export class GrokLLM extends BaseLLM {
  readonly id = "grok" as const;
  private provider: ReturnType<typeof createOpenAICompatible>;
  private model: string;

  constructor(model?: string, apiKey?: string, searchTools?: Record<string, unknown>) {
    super(searchTools);
    const key = apiKey ?? process.env["XAI_API_KEY"];
    if (!key) throw new Error("XAI_API_KEY environment variable is required for Grok LLM");
    this.model = model || DEFAULT_MODEL;
    this.provider = createOpenAICompatible({
      name: "grok",
      baseURL: XAI_BASE_URL,
      apiKey: key,
    });
  }

  protected createLanguageModel(): LanguageModel {
    return this.provider(this.model);
  }

  protected createSearchTools() {
    return {};
  }
}
