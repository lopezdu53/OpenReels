import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";
import { BaseLLM } from "./base.js";
import type { LLMResult } from "../../schema/providers.js";

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

  /**
   * VIVI doesn't support responseFormat or tool_use for structured outputs.
   * Fall back to prompt-based JSON extraction: ask for JSON in the prompt,
   * generate plain text, then parse and validate with the Zod schema.
   */
  protected async generateStructured<T extends z.ZodType>(opts: {
    systemPrompt: string;
    userMessage: string;
    schema: T;
  }): Promise<LLMResult<z.infer<T>>> {
    const languageModel = this.createLanguageModel();

    const systemWithJson =
      opts.systemPrompt +
      "\n\nCRITICAL: Your entire response MUST be a single valid JSON object. No markdown fences, no explanation, no text before or after. Just the raw JSON.";

    const result = await generateText({
      model: languageModel,
      system: systemWithJson,
      prompt: opts.userMessage,
    });

    const text = result.text.trim();

    // Strip optional markdown code fences (```json ... ```)
    const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    // Find the outermost JSON object
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1) {
      throw new Error(`VIVI did not return a JSON object. Response: ${stripped.slice(0, 200)}`);
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
