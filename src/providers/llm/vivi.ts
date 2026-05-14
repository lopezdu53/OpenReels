import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { BaseLLM } from "./base.js";

const VIVI_BASE_URL = "https://api.viviai.cc/v1";

export class ViviLLM extends BaseLLM {
  readonly id = "vivi" as const;
  private provider: ReturnType<typeof createOpenAICompatible>;
  private model: string;

  constructor(
    model: string = "claude-sonnet-4-6",
    apiKey?: string,
    searchTools?: Record<string, unknown>,
  ) {
    super(searchTools);
    this.model = model;
    const key = apiKey ?? process.env["VIVI_LLM_API_KEY"];
    if (!key) throw new Error("VIVI_LLM_API_KEY environment variable is required");
    this.provider = createOpenAICompatible({
      name: "vivi",
      baseURL: VIVI_BASE_URL,
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
