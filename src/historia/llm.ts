import { AliCloudLLM } from "../providers/llm/alicloud.js";
import { AnthropicLLM } from "../providers/llm/anthropic.js";
import { AtlasLLM } from "../providers/llm/atlas.js";
import { CloudflareLLM } from "../providers/llm/cloudflare.js";
import { GeminiLLM } from "../providers/llm/gemini.js";
import { GrokLLM } from "../providers/llm/grok.js";
import { OpenAILLM } from "../providers/llm/openai.js";
import { OpenRouterLLM } from "../providers/llm/openrouter.js";
import { ViviLLM } from "../providers/llm/vivi.js";
import type { LLMProvider } from "../schema/providers.js";
import { DEFAULT_HISTORIA_LLM_MODEL, DEFAULT_HISTORIA_LLM_PROVIDER } from "./catalog.js";

export function createHistoriaLlm(provider?: string, model?: string): LLMProvider {
  const key = provider || DEFAULT_HISTORIA_LLM_PROVIDER;
  const id = model || DEFAULT_HISTORIA_LLM_MODEL;
  switch (key) {
    case "atlas":
      return new AtlasLLM(id);
    case "gemini":
      return new GeminiLLM(id);
    case "anthropic":
      return new AnthropicLLM(id);
    case "openai":
      return new OpenAILLM(id);
    case "grok":
      return new GrokLLM(id);
    case "openrouter":
      return new OpenRouterLLM(id);
    case "vivi":
      return new ViviLLM(id);
    case "alicloud":
      return new AliCloudLLM(id);
    default:
      return new CloudflareLLM(id);
  }
}
