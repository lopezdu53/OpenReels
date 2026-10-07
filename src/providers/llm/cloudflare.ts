import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import {
  cloudflareApiToken,
  cloudflareOpenAiBase,
} from "../cloudflare/client.js";
import { DEFAULT_CLOUDFLARE_LLM, resolveCloudflareLlm } from "../cloudflare/catalog.js";
import { BaseLLM } from "./base.js";

export class CloudflareLLM extends BaseLLM {
  readonly id = "cloudflare" as const;
  private provider: ReturnType<typeof createOpenAICompatible>;
  private model: string;

  constructor(model?: string, apiKey?: string, searchTools?: Record<string, unknown>) {
    super(searchTools);
    const key = cloudflareApiToken(apiKey);
    if (!key) throw new Error("CLOUDFLARE_API_TOKEN is required for Cloudflare LLM");
    this.model = resolveCloudflareLlm(model) || DEFAULT_CLOUDFLARE_LLM;
    this.provider = createOpenAICompatible({
      name: "cloudflare",
      baseURL: cloudflareOpenAiBase(),
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
