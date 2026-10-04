import { AliCloudLLM } from "../providers/llm/alicloud.js";
import { AnthropicLLM } from "../providers/llm/anthropic.js";
import { AtlasLLM } from "../providers/llm/atlas.js";
import { GeminiLLM } from "../providers/llm/gemini.js";
import { GrokLLM } from "../providers/llm/grok.js";
import { OpenAILLM } from "../providers/llm/openai.js";
import { OpenRouterLLM } from "../providers/llm/openrouter.js";
import { ViviLLM } from "../providers/llm/vivi.js";
import type { ImageProviderKey, LLMProvider, LLMProviderKey } from "../schema/providers.js";

export const CRONOGRAMA_LLMS: { key: LLMProviderKey; label: string; env: string }[] = [
  { key: "vivi", label: "Vivi (Claude)", env: "VIVI_LLM_API_KEY" },
  { key: "anthropic", label: "Anthropic", env: "ANTHROPIC_API_KEY" },
  { key: "openai", label: "OpenAI", env: "OPENAI_API_KEY" },
  { key: "gemini", label: "Gemini", env: "GOOGLE_API_KEY" },
  { key: "grok", label: "Grok", env: "XAI_API_KEY" },
  { key: "atlas", label: "Atlas Cloud", env: "ATLASCLOUD_API_KEY" },
  { key: "openrouter", label: "OpenRouter", env: "OPENROUTER_API_KEY" },
  { key: "alicloud", label: "AliCloud", env: "ALICLOUD_API_KEY" },
];

export const CRONOGRAMA_IMAGES: { key: ImageProviderKey; label: string; env: string }[] = [
  { key: "vivi", label: "Vivi imagen", env: "VIVI_IMAGE_API_KEY" },
  { key: "gemini", label: "Gemini imagen", env: "GOOGLE_API_KEY" },
  { key: "openai", label: "OpenAI imagen", env: "OPENAI_API_KEY" },
  { key: "grok", label: "Grok imagen", env: "XAI_API_KEY" },
  { key: "atlas", label: "Atlas imagen", env: "ATLASCLOUD_API_KEY" },
  { key: "fal", label: "Fal", env: "FAL_API_KEY" },
  { key: "sharpii", label: "Sharpii", env: "SHARPII_API_KEY" },
  { key: "alicloud", label: "AliCloud imagen", env: "ALICLOUD_API_KEY" },
];

export function providerReady(env: string): boolean {
  return Boolean(process.env[env]?.trim());
}

export function listLlmStatus(): { key: string; label: string; ready: boolean }[] {
  return CRONOGRAMA_LLMS.map((row) => ({ key: row.key, label: row.label, ready: providerReady(row.env) }));
}

export function listImageStatus(): { key: string; label: string; ready: boolean }[] {
  return CRONOGRAMA_IMAGES.map((row) => ({ key: row.key, label: row.label, ready: providerReady(row.env) }));
}

export function firstReadyLlm(): LLMProviderKey {
  const hit = CRONOGRAMA_LLMS.find((row) => providerReady(row.env));
  return hit?.key ?? "vivi";
}

export function createCronogramaLlm(key: string, model?: string): LLMProvider {
  switch (key) {
    case "openai":
      return new OpenAILLM(model);
    case "gemini":
      return new GeminiLLM(model);
    case "openrouter":
      return new OpenRouterLLM(model);
    case "vivi":
      return new ViviLLM(model);
    case "alicloud":
      return new AliCloudLLM(model);
    case "grok":
      return new GrokLLM(model);
    case "atlas":
      return new AtlasLLM(model);
    default:
      return new AnthropicLLM(model);
  }
}
