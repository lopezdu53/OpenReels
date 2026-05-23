import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";
import type { LLMResult } from "../../schema/providers.js";
import { BaseLLM } from "./base.js";

const ALICLOUD_BASE_URL =
  process.env["ALICLOUD_BASE_URL"] ??
  "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";

// Available models on this plan:
//   Qwen:      qwen3.7-max | qwen3.6-plus | qwen3.6-flash
//   DeepSeek:  deepseek-v4-pro | deepseek-v4-flash | deepseek-v3.2
//   Zhipu:     glm-5 | glm-5.1
//   MiniMax:   MiniMax-M2.5
//   Moonshot:  kimi-k2.6 | kimi-k2.5
const DEFAULT_MODEL = "qwen3.7-max";

export class AliCloudLLM extends BaseLLM {
  readonly id = "alicloud" as const;
  private provider: ReturnType<typeof createOpenAICompatible>;
  private model: string;

  constructor(model?: string, apiKey?: string, searchTools?: Record<string, unknown>) {
    super(searchTools);
    const key = apiKey ?? process.env["ALICLOUD_API_KEY"];
    if (!key) throw new Error("ALICLOUD_API_KEY environment variable is required");
    this.model = model ?? DEFAULT_MODEL;
    this.provider = createOpenAICompatible({
      name: "alicloud",
      baseURL: ALICLOUD_BASE_URL,
      apiKey: key,
    });
  }

  protected createLanguageModel(): LanguageModel {
    return this.provider(this.model);
  }

  protected createSearchTools() {
    return {};
  }

  /**
   * Qwen models don't support responseFormat / structuredOutputs.
   * Use prompt-based JSON extraction: instruct model to respond with raw JSON,
   * then parse and validate with the Zod schema.
   */
  protected async generateStructured<T extends z.ZodType>(opts: {
    systemPrompt: string;
    userMessage: string;
    schema: T;
  }): Promise<LLMResult<z.infer<T>>> {
    const languageModel = this.createLanguageModel();

    const systemWithJson =
      opts.systemPrompt +
      "\n\nCRITICAL: Your entire response MUST be valid JSON only. No markdown fences, no explanation, no text before or after. Just the raw JSON (object or array).";

    const result = await generateText({
      model: languageModel,
      system: systemWithJson,
      prompt: opts.userMessage,
      maxTokens: 32000,
    });

    const text = result.text.trim();
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    // Find outermost JSON structure — supports both objects {} and arrays []
    const objStart = stripped.indexOf("{");
    const arrStart = stripped.indexOf("[");
    let start: number;
    let end: number;
    if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
      start = objStart;
      end = stripped.lastIndexOf("}");
    } else if (arrStart !== -1) {
      start = arrStart;
      end = stripped.lastIndexOf("]");
    } else {
      throw new Error(`AliCloud did not return JSON. Response: ${stripped.slice(0, 200)}`);
    }

    const jsonStr = stripped.slice(start, end + 1);
    const parsed: unknown = JSON.parse(jsonStr);
    const validated = opts.schema.parse(parsed) as z.infer<T>;

    return {
      data: validated,
      usage: {
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
      },
    };
  }
}
