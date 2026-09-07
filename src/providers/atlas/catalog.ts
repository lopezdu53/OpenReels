/**
 * Curated Atlas Cloud models for OpenReels.
 *
 * Live snapshot 2026-09-07 from:
 *   GET https://api.atlascloud.ai/v1/models          (LLM, per-token)
 *   GET https://api.atlascloud.ai/api/v1/models      (media, per image / second)
 *
 * Atlas is pay-as-you-go, no subscription. LLM prices are per token;
 * we store per-1M for the cost estimator. Media prices are the
 * discounted `price.actual.base_price` on the console catalog.
 */

export const ATLAS_LLM_BASE = "https://api.atlascloud.ai/v1";
export const ATLAS_MEDIA_BASE = "https://api.atlascloud.ai/api/v1";
export const ATLAS_USER_AGENT = "openreels/1.0 (+https://github.com/lopezdu53/OpenReels)";

export interface AtlasLlmModel {
  id: string;
  label: string;
  inputPer1M: number;
  outputPer1M: number;
}

export interface AtlasImageModel {
  id: string;
  editId?: string;
  label: string;
  usd: number;
  refs: boolean;
}

export interface AtlasVideoModel {
  id: string;
  label: string;
  usdPerSecond: number;
  durations: number[];
  lastFrame?: boolean;
  /** Talking-head from still + audio (skips motion I2V). */
  talkingHead?: boolean;
}

export interface AtlasLipSyncModel {
  id: string;
  label: string;
  usdPerSecond: number;
  /** image+audio talking head vs video+audio re-drive */
  kind: "video_audio" | "image_audio";
}

export const ATLAS_LLM_MODELS: AtlasLlmModel[] = [
  { id: "qwen/qwen3.5-flash", label: "Qwen 3.5 Flash", inputPer1M: 0.1, outputPer1M: 0.4 },
  { id: "deepseek-ai/deepseek-v4-flash", label: "DeepSeek V4 Flash", inputPer1M: 0.14, outputPer1M: 0.28 },
  { id: "deepseek-ai/deepseek-v3.2", label: "DeepSeek V3.2", inputPer1M: 0.26, outputPer1M: 0.38 },
  { id: "minimaxai/minimax-m3", label: "MiniMax M3", inputPer1M: 0.3, outputPer1M: 1.2 },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash", inputPer1M: 0.3, outputPer1M: 2.5 },
  { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5", inputPer1M: 0.49, outputPer1M: 2.5 },
  { id: "zai-org/glm-4.7", label: "GLM 4.7", inputPer1M: 0.52, outputPer1M: 1.85 },
  { id: "deepseek-ai/deepseek-v4-pro", label: "DeepSeek V4 Pro", inputPer1M: 1.68, outputPer1M: 3.38 },
];

export const DEFAULT_ATLAS_LLM_MODEL = "deepseek-ai/deepseek-v4-flash";

export interface AtlasTtsModel {
  id: string;
  label: string;
  usdPer1kChars: number;
}

export const ATLAS_TTS_MODELS: AtlasTtsModel[] = [
  { id: "xai/tts-v1", label: "xAI TTS v1", usdPer1kChars: 0.015 },
];

export const DEFAULT_ATLAS_TTS_MODEL = "xai/tts-v1";

export const ATLAS_TTS_VOICES = [
  { id: "eve", label: "Eve — Energetic (F)", gender: "female" },
  { id: "ara", label: "Ara — Warm (F)", gender: "female" },
  { id: "leo", label: "Leo — Authoritative (M)", gender: "male" },
  { id: "rex", label: "Rex — Confident (M)", gender: "male" },
  { id: "sal", label: "Sal — Smooth (M)", gender: "male" },
] as const;

export const DEFAULT_ATLAS_TTS_VOICE = "eve";
/** xAI TTS on Atlas: $0.015 per 1K characters. */
export const ATLAS_TTS_PER_1K_CHARS = 0.015;

export const ATLAS_IMAGE_MODELS: AtlasImageModel[] = [
  { id: "openai/gpt-image-2/text-to-image", label: "GPT Image 2", usd: 0.009, refs: false },
  { id: "bytedance/seedream-v4.7/text-to-image", editId: "bytedance/seedream-v4.7/edit", label: "Seedream 4.7", usd: 0.03, refs: true },
  { id: "qwen-image-3.0/text-to-image", editId: "qwen-image-3.0/edit", label: "Qwen Image 3.0", usd: 0.03, refs: true },
  { id: "google/nano-banana-2-lite/text-to-image", editId: "google/nano-banana-2-lite/edit", label: "Nano Banana 2 Lite", usd: 0.04, refs: true },
  { id: "google/nano-banana-2/text-to-image", editId: "google/nano-banana-2/edit", label: "Nano Banana 2", usd: 0.08, refs: true },
];

export const DEFAULT_ATLAS_IMAGE_MODEL = "google/nano-banana-2-lite/text-to-image";

export const ATLAS_VIDEO_MODELS: AtlasVideoModel[] = [
  { id: "bytedance/seedance-2.0-mini/image-to-video", label: "Seedance 2.0 Mini", usdPerSecond: 0.011, durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], lastFrame: true },
  { id: "minimax/h3-developer/image-to-video", label: "MiniMax H3 Developer", usdPerSecond: 0.02, durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], lastFrame: true },
  { id: "atlascloud/wan-2.2-turbo/image-to-video", label: "Wan 2.2 Turbo", usdPerSecond: 0.02, durations: [5] },
  { id: "atlascloud/infinitetalk", label: "InfiniteTalk (foto + audio)", usdPerSecond: 0.03, durations: [5, 8, 10, 15], talkingHead: true },
  { id: "google/gemini-omni-1.1-flash/image-to-video", label: "Gemini Omni 1.1 Flash", usdPerSecond: 0.039, durations: [4, 5, 6, 8, 10], lastFrame: true },
  { id: "alibaba/wan-3.0/image-to-video", label: "Wan 3.0", usdPerSecond: 0.04, durations: [5, 8, 10], lastFrame: true },
  { id: "minimax/h3-fast/image-to-video", label: "MiniMax H3 Fast", usdPerSecond: 0.0437, durations: [5, 8, 10] },
  { id: "alibaba/wan-3.0-prime/image-to-video", label: "Wan 3.0 Prime", usdPerSecond: 0.0612, durations: [5, 8, 10], lastFrame: true },
  { id: "kwaivgi/kling-v3.0-turbo/image-to-video", label: "Kling 3.0 Turbo", usdPerSecond: 0.095, durations: [5, 10] },
];

export const DEFAULT_ATLAS_VIDEO_MODEL = "bytedance/seedance-2.0-mini/image-to-video";

export const ATLAS_LIPSYNC_MODELS: AtlasLipSyncModel[] = [
  { id: "veed/lipsync", label: "VEED Lipsync", usdPerSecond: 0.013, kind: "video_audio" },
  { id: "atlascloud/infinitetalk", label: "InfiniteTalk talking-head", usdPerSecond: 0.03, kind: "image_audio" },
  { id: "sync/lipsync-v3", label: "Sync.so Lipsync v3", usdPerSecond: 0.22, kind: "video_audio" },
];

export const DEFAULT_ATLAS_LIPSYNC_MODEL = "veed/lipsync";

function pick<T extends { id: string }>(list: T[], id: string | undefined, fallbackId: string): T {
  return list.find((m) => m.id === id) ?? list.find((m) => m.id === fallbackId) ?? list[0]!;
}

export function resolveAtlasLlmModel(id?: string): AtlasLlmModel {
  return pick(ATLAS_LLM_MODELS, id, DEFAULT_ATLAS_LLM_MODEL);
}

export function resolveAtlasImageModel(id?: string): AtlasImageModel {
  return pick(ATLAS_IMAGE_MODELS, id, DEFAULT_ATLAS_IMAGE_MODEL);
}

export function resolveAtlasVideoModel(id?: string): AtlasVideoModel {
  return pick(ATLAS_VIDEO_MODELS, id, DEFAULT_ATLAS_VIDEO_MODEL);
}

export function resolveAtlasLipSyncModel(id?: string): AtlasLipSyncModel {
  return pick(ATLAS_LIPSYNC_MODELS, id, DEFAULT_ATLAS_LIPSYNC_MODEL);
}

export function resolveAtlasTtsModel(id?: string): AtlasTtsModel {
  return pick(ATLAS_TTS_MODELS, id, DEFAULT_ATLAS_TTS_MODEL);
}

export function llmSortKey(m: AtlasLlmModel): number {
  return m.inputPer1M + m.outputPer1M;
}

export function sortedAtlasLlmModels(): AtlasLlmModel[] {
  return [...ATLAS_LLM_MODELS].sort((a, b) => llmSortKey(a) - llmSortKey(b));
}

export function sortedAtlasImageModels(): AtlasImageModel[] {
  return [...ATLAS_IMAGE_MODELS].sort((a, b) => a.usd - b.usd);
}

export function sortedAtlasVideoModels(): AtlasVideoModel[] {
  return [...ATLAS_VIDEO_MODELS].sort((a, b) => a.usdPerSecond - b.usdPerSecond);
}

export function sortedAtlasLipSyncModels(): AtlasLipSyncModel[] {
  return [...ATLAS_LIPSYNC_MODELS].sort((a, b) => a.usdPerSecond - b.usdPerSecond);
}

export function atlasLlmPriceLabel(m: AtlasLlmModel): string {
  return `$${m.inputPer1M.toFixed(2)} / $${m.outputPer1M.toFixed(2)} por 1M`;
}

export function atlasImagePriceLabel(m: AtlasImageModel): string {
  return `$${m.usd.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} / imagen`;
}

export function atlasPerSecondPriceLabel(usd: number): string {
  return `$${usd.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} / s`;
}

export function atlasTtsPriceLabel(m: AtlasTtsModel): string {
  return `$${m.usdPer1kChars.toFixed(3)} / 1K chars`;
}

export function atlasLlmPricing(id?: string): { perInputToken: number; perOutputToken: number } {
  const m = resolveAtlasLlmModel(id);
  return { perInputToken: m.inputPer1M / 1_000_000, perOutputToken: m.outputPer1M / 1_000_000 };
}

export function atlasImageUsd(id?: string): number {
  return resolveAtlasImageModel(id).usd;
}

export function atlasVideoPerSecondUsd(id?: string): number {
  return resolveAtlasVideoModel(id).usdPerSecond;
}

export function atlasLipSyncPerSecondUsd(id?: string): number {
  return resolveAtlasLipSyncModel(id).usdPerSecond;
}
