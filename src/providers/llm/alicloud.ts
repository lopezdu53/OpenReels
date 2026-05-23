import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
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
}
