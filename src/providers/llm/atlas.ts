import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { z } from "zod";
import type { LLMResult } from "../../schema/providers.js";
import { ATLAS_LLM_BASE, ATLAS_USER_AGENT, DEFAULT_ATLAS_LLM_MODEL } from "../atlas/catalog.js";
import { requireAtlasApiKey, rewriteAtlasAuthError } from "../atlas/client.js";
import { BaseLLM } from "./base.js";

export class AtlasLLM extends BaseLLM {
  readonly id = "atlas" as const;
  private provider: ReturnType<typeof createOpenAICompatible>;
  private model: string;

  constructor(model?: string, apiKey?: string, searchTools?: Record<string, unknown>) {
    super(searchTools);
    const key = requireAtlasApiKey("LLM", apiKey);
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

  async generate<T extends z.ZodType>(opts: {
    systemPrompt: string;
    userMessage: string;
    schema: T;
    enableWebSearch?: boolean;
  }): Promise<LLMResult<z.infer<T>>> {
    try {
      return await super.generate(opts);
    } catch (err) {
      throw rewriteAtlasAuthError(err);
    }
  }
}
