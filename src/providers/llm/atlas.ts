import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { ATLAS_LLM_BASE, ATLAS_USER_AGENT, DEFAULT_ATLAS_LLM_MODEL } from "../atlas/catalog.js";
import { BaseLLM } from "./base.js";

export class AtlasLLM extends BaseLLM {
  readonly id = "atlas" as const;
  private provider: ReturnType<typeof createOpenAICompatible>;
  private model: string;

  constructor(model?: string, apiKey?: string, searchTools?: Record<string, unknown>) {
    super(searchTools);
    const key = apiKey ?? process.env["ATLASCLOUD_API_KEY"];
    if (!key) throw new Error("ATLASCLOUD_API_KEY environment variable is required for Atlas LLM");
    this.model = model || DEFAULT_ATLAS_LLM_MODEL;
    this.provider = createOpenAICompatible({
      name: "atlascloud",
      baseURL: ATLAS_LLM_BASE,
      apiKey: key,
      headers: { "User-Agent": ATLAS_USER_AGENT },
    });
  }

  protected createLanguageModel(): LanguageModel {
    return this.provider(this.model);
  }

  protected createSearchTools() {
    return {};
  }
}
