import { ATLAS_IMAGE_MODELS, ATLAS_LLM_MODELS, ATLAS_VIDEO_MODELS } from "../providers/atlas/catalog.js";
import {
  CLOUDFLARE_IMAGE_MODELS,
  CLOUDFLARE_LLM_MODELS,
  DEFAULT_CLOUDFLARE_IMAGE,
  DEFAULT_CLOUDFLARE_LLM,
} from "../providers/cloudflare/catalog.js";
import { GFLOW_IMAGE_MODELS, GFLOW_VIDEO_MODELS } from "../providers/gflow/catalog.js";
import { NARA_TTS_PROVIDERS } from "../nara/catalog.js";
import { RUNPOD_IMAGE_MODELS, RUNPOD_VIDEO_MODELS } from "../providers/runpod/catalog.js";
import { SHARPII_IMAGE_MODELS, SHARPII_VIDEO_MODELS } from "../providers/sharpii/catalog.js";
import { TOBY_IMAGE_MODELS, TOBY_VIDEO_MODELS } from "../providers/toby/catalog.js";

export interface HistoriaModelOpt {
  id: string;
  label: string;
  note?: string;
}

export interface HistoriaProviderOpt {
  key: string;
  label: string;
  category: string;
  models: HistoriaModelOpt[];
  defaultModel?: string;
}

export const DEFAULT_HISTORIA_LLM_PROVIDER = "cloudflare";
export const DEFAULT_HISTORIA_LLM_MODEL = DEFAULT_CLOUDFLARE_LLM;
export const DEFAULT_HISTORIA_TTS_PROVIDER = "grok-tts";
export const DEFAULT_HISTORIA_TTS_VOICE = "eve";
export const DEFAULT_HISTORIA_IMAGE_PROVIDER = "cloudflare";
export const DEFAULT_HISTORIA_IMAGE_MODEL = DEFAULT_CLOUDFLARE_IMAGE;
export const DEFAULT_HISTORIA_VIDEO_PROVIDER = "toby";
export const DEFAULT_HISTORIA_VIDEO_MODEL = "omni-flash";
export const DEFAULT_HISTORIA_ANIMATE = false;

export const HISTORIA_LLM_PROVIDERS: HistoriaProviderOpt[] = [
  {
    key: "cloudflare",
    label: "Cloudflare Workers AI",
    category: "Cloudflare",
    defaultModel: DEFAULT_CLOUDFLARE_LLM,
    models: CLOUDFLARE_LLM_MODELS.map((m) => ({ id: m.id, label: m.label, note: m.note })),
  },
  {
    key: "atlas",
    label: "Atlas Cloud",
    category: "Atlas",
    defaultModel: "google/gemini-2.5-flash",
    models: ATLAS_LLM_MODELS.map((m) => ({ id: m.id, label: m.label })),
  },
  {
    key: "gemini",
    label: "Google Gemini",
    category: "Google",
    defaultModel: "gemini-2.5-flash",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
    ],
  },
  {
    key: "anthropic",
    label: "Anthropic Claude",
    category: "Anthropic",
    defaultModel: "claude-sonnet-4-6",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    ],
  },
  {
    key: "openai",
    label: "OpenAI",
    category: "OpenAI",
    defaultModel: "gpt-5.4",
    models: [
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
      { id: "gpt-4o", label: "GPT-4o" },
    ],
  },
  {
    key: "grok",
    label: "Grok (xAI)",
    category: "xAI",
    defaultModel: "grok-4",
    models: [
      { id: "grok-4", label: "Grok 4" },
      { id: "grok-3", label: "Grok 3" },
    ],
  },
  {
    key: "openrouter",
    label: "OpenRouter",
    category: "OpenRouter",
    defaultModel: "anthropic/claude-sonnet-4",
    models: [
      { id: "anthropic/claude-sonnet-4", label: "Claude Sonnet 4" },
      { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini" },
    ],
  },
  {
    key: "vivi",
    label: "VIVI",
    category: "VIVI",
    defaultModel: "claude-sonnet-4-6",
    models: [
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
    ],
  },
  {
    key: "alicloud",
    label: "Alibaba Cloud",
    category: "Alibaba",
    defaultModel: "qwen3.6-flash",
    models: [
      { id: "qwen3.6-flash", label: "Qwen 3.6 Flash" },
      { id: "qwen3.6-plus", label: "Qwen 3.6 Plus" },
      { id: "deepseek-v3.2", label: "DeepSeek V3.2" },
    ],
  },
];

export const HISTORIA_IMAGE_PROVIDERS: HistoriaProviderOpt[] = [
  {
    key: "cloudflare",
    label: "Cloudflare FLUX",
    category: "Cloudflare",
    defaultModel: DEFAULT_CLOUDFLARE_IMAGE,
    models: CLOUDFLARE_IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label, note: m.note })),
  },
  {
    key: "toby",
    label: "Toby (Flow MCP)",
    category: "Flow",
    defaultModel: "nano-pro",
    models: TOBY_IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label, note: m.note })),
  },
  {
    key: "gflow",
    label: "gflow (Imagen)",
    category: "Flow",
    defaultModel: "nano-pro",
    models: GFLOW_IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label, note: m.note })),
  },
  {
    key: "atlas",
    label: "Atlas Cloud",
    category: "Atlas",
    defaultModel: "google/nano-banana-2-lite/text-to-image",
    models: ATLAS_IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label })),
  },
  {
    key: "gemini",
    label: "Google Gemini",
    category: "Google",
    defaultModel: "gemini-2.5-flash-image",
    models: [{ id: "gemini-2.5-flash-image", label: "Gemini Flash Image" }],
  },
  {
    key: "openai",
    label: "OpenAI",
    category: "OpenAI",
    defaultModel: "gpt-image-1",
    models: [{ id: "gpt-image-1", label: "GPT Image 1" }],
  },
  {
    key: "grok",
    label: "Grok Imagine",
    category: "xAI",
    defaultModel: "grok-imagine-image",
    models: [{ id: "grok-imagine-image", label: "Grok Imagine Image" }],
  },
  {
    key: "vivi",
    label: "VIVI",
    category: "VIVI",
    defaultModel: "gemini-image",
    models: [{ id: "gemini-image", label: "VIVI Gemini Image" }],
  },
  {
    key: "fal",
    label: "fal.ai",
    category: "fal",
    defaultModel: "flux",
    models: [{ id: "flux", label: "FLUX" }],
  },
  {
    key: "runpod",
    label: "RunPod",
    category: "RunPod",
    defaultModel: RUNPOD_IMAGE_MODELS[0]?.id,
    models: RUNPOD_IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label, note: m.costHint })),
  },
  {
    key: "sharpii",
    label: "Sharpii",
    category: "Sharpii",
    defaultModel: SHARPII_IMAGE_MODELS[0]?.id,
    models: SHARPII_IMAGE_MODELS.map((m) => ({ id: m.id, label: m.label })),
  },
  {
    key: "alicloud",
    label: "Alibaba Cloud",
    category: "Alibaba",
    defaultModel: "wanx",
    models: [{ id: "wanx", label: "Wanx" }],
  },
];

export const HISTORIA_VIDEO_PROVIDERS: HistoriaProviderOpt[] = [
  {
    key: "toby",
    label: "Toby (Flow MCP)",
    category: "Flow",
    defaultModel: "omni-flash",
    models: TOBY_VIDEO_MODELS.filter((m) => m.id !== "veo-lite-lp").map((m) => ({
      id: m.id,
      label: m.label,
      note: m.note,
    })),
  },
  {
    key: "gflow",
    label: "gflow (Veo / Omni)",
    category: "Flow",
    defaultModel: "omni-flash",
    models: GFLOW_VIDEO_MODELS.filter((m) => m.id !== "veo-lite-lp").map((m) => ({
      id: m.id,
      label: m.label,
      note: m.note,
    })),
  },
  {
    key: "atlas",
    label: "Atlas Cloud",
    category: "Atlas",
    defaultModel: "bytedance/seedance-2.0-mini/image-to-video",
    models: ATLAS_VIDEO_MODELS.map((m) => ({ id: m.id, label: m.label })),
  },
  {
    key: "gemini",
    label: "Google Veo",
    category: "Google",
    defaultModel: "veo-3.1",
    models: [{ id: "veo-3.1", label: "Veo 3.1" }],
  },
  {
    key: "fal",
    label: "fal.ai Kling",
    category: "fal",
    defaultModel: "kling-2.6-pro",
    models: [{ id: "kling-2.6-pro", label: "Kling 2.6 Pro" }],
  },
  {
    key: "grok",
    label: "Grok Imagine Video",
    category: "xAI",
    defaultModel: "grok-imagine-video",
    models: [{ id: "grok-imagine-video", label: "Grok Imagine Video 1.5" }],
  },
  {
    key: "vivi",
    label: "VIVI",
    category: "VIVI",
    defaultModel: "grok-video-3",
    models: [{ id: "grok-video-3", label: "Grok Video 3" }],
  },
  {
    key: "runpod",
    label: "RunPod",
    category: "RunPod",
    defaultModel: RUNPOD_VIDEO_MODELS[0]?.id,
    models: RUNPOD_VIDEO_MODELS.map((m) => ({ id: m.id, label: m.label, note: m.costHint })),
  },
  {
    key: "sharpii",
    label: "Sharpii",
    category: "Sharpii",
    defaultModel: SHARPII_VIDEO_MODELS[0]?.id,
    models: SHARPII_VIDEO_MODELS.map((m) => ({ id: m.id, label: m.label })),
  },
  {
    key: "cloudflare",
    label: "Cloudflare (sin I2V)",
    category: "Cloudflare",
    defaultModel: "none",
    models: [{ id: "none", label: "No hay I2V en Workers AI" }],
  },
];

export const HISTORIA_TTS_PROVIDERS = NARA_TTS_PROVIDERS;

export function findHistoriaProvider(list: HistoriaProviderOpt[], key: string): HistoriaProviderOpt {
  return list.find((p) => p.key === key) ?? list[0]!;
}

export function isHistoriaLlmProvider(key: string): boolean {
  return HISTORIA_LLM_PROVIDERS.some((p) => p.key === key);
}

export function isHistoriaImageProvider(key: string): boolean {
  return HISTORIA_IMAGE_PROVIDERS.some((p) => p.key === key);
}

export function isHistoriaVideoProvider(key: string): boolean {
  return HISTORIA_VIDEO_PROVIDERS.some((p) => p.key === key);
}

export function historiaEngineCatalog() {
  return {
    llmProviders: HISTORIA_LLM_PROVIDERS,
    ttsProviders: HISTORIA_TTS_PROVIDERS,
    imageProviders: HISTORIA_IMAGE_PROVIDERS,
    videoProviders: HISTORIA_VIDEO_PROVIDERS,
    defaultLlmProvider: DEFAULT_HISTORIA_LLM_PROVIDER,
    defaultLlm: DEFAULT_HISTORIA_LLM_MODEL,
    defaultTtsProvider: DEFAULT_HISTORIA_TTS_PROVIDER,
    defaultTtsVoice: DEFAULT_HISTORIA_TTS_VOICE,
    defaultImageProvider: DEFAULT_HISTORIA_IMAGE_PROVIDER,
    defaultImageModel: DEFAULT_HISTORIA_IMAGE_MODEL,
    defaultVideoProvider: DEFAULT_HISTORIA_VIDEO_PROVIDER,
    defaultVideoModel: DEFAULT_HISTORIA_VIDEO_MODEL,
    defaultAnimate: DEFAULT_HISTORIA_ANIMATE,
  };
}
