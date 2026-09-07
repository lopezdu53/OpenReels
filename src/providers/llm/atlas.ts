import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";
import type { LLMResult } from "../../schema/providers.js";
import { ATLAS_LLM_BASE, ATLAS_USER_AGENT, DEFAULT_ATLAS_LLM_MODEL } from "../atlas/catalog.js";
import { requireAtlasApiKey, rewriteAtlasAuthError } from "../atlas/client.js";
import { BaseLLM } from "./base.js";
import { parseJsonObjectFromText, parseLlmJson, schemaHint } from "./json-extract.js";

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

  /**
   * DeepSeek / Qwen on Atlas often 400 on response_format json_schema.
   * Fall back to plain JSON in the prompt (same as VIVI).
   */
  protected async generateStructured<T extends z.ZodType>(opts: {
    systemPrompt: string;
    userMessage: string;
    schema: T;
  }): Promise<LLMResult<z.infer<T>>> {
    try {
      return await super.generateStructured(opts);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[atlas] structured output failed, using JSON prompt: ${msg}`);
    }

    const languageModel = this.createLanguageModel();
    const result = await generateText({
      model: languageModel,
      system:
        opts.systemPrompt +
        "\n\nCRITICAL: Your entire response MUST be a single valid JSON object. No markdown fences, no explanation. Just raw JSON." +
        schemaHint(opts.schema),
      prompt: opts.userMessage,
    });
    const parsed = parseJsonObjectFromText(result.text, "Atlas");
    return {
      data: parseLlmJson(opts.schema, parsed),
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
    };
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
