import type { ApiPrices } from "@/pages/LabPage";
import { VIVI_IMAGE_CNY, VIVI_LLM_CNY } from "@/lib/vivi-prices";

export interface JobCostPreviewInput {
  llm: string;
  tts: string;
  image: string;
  video?: string;
  music: string;
  pacing?: string;
  platform?: string;
  targetDurationMinutes?: number;
  allowedVisualTypes: string[];
  videoSceneMode?: string;
  dryRun?: boolean;
}

export interface JobCostLine {
  id: string;
  label: string;
  usd: number;
  detail: string;
}

export interface JobCostPreview {
  lines: JobCostLine[];
  totalUsd: number;
  sceneCount: number;
  ttsCharacters: number;
  aiImages: number;
  aiVideos: number;
}

const TOKEN = {
  research: { input: 2000, output: 1000 },
  director: { input: 5000, output: 2000 },
  critic: { input: 3000, output: 500 },
  prompter: { input: 800, output: 200 },
};

const PACING_SCENES: Record<string, { scenes: number; words: number }> = {
  fast: { scenes: 19, words: 235 },
  moderate: { scenes: 16, words: 235 },
  cinematic: { scenes: 12, words: 240 },
};

function llmCallCost(prices: ApiPrices, provider: string, est: { input: number; output: number }): number {
  const p = prices.llm[provider] ?? prices.llm["anthropic"] ?? { inputPer1M: 3, outputPer1M: 15 };
  return (est.input / 1_000_000) * p.inputPer1M + (est.output / 1_000_000) * p.outputPer1M;
}

function countVideos(sceneCount: number, mode: string | undefined, hasVideo: boolean): number {
  if (!hasVideo || sceneCount <= 0) return 0;
  switch (mode) {
    case "first":
    case "force_first":
      return 1;
    case "first3":
    case "force_first3":
      return Math.min(3, sceneCount);
    case "first_every2":
    case "force_first_every2":
      return Math.ceil(sceneCount / 2);
    default:
      return Math.max(2, Math.round(sceneCount / 4));
  }
}

export function estimateJobCost(input: JobCostPreviewInput, prices: ApiPrices): JobCostPreview {
  const longForm = input.platform === "reel_extend" || input.platform === "youtube_horizontal";
  const minutes = input.targetDurationMinutes ?? 5;
  const pacing = PACING_SCENES[input.pacing || "moderate"] ?? PACING_SCENES.moderate!;
  const sceneCount = longForm ? Math.max(8, Math.round(minutes * 150 / 14)) : pacing.scenes;
  const words = longForm ? Math.round(minutes * 150) : pacing.words;
  const ttsCharacters = Math.round(words * 5.4);

  const types = new Set(input.allowedVisualTypes);
  const hasVideo = types.has("ai_video");
  const hasImage = types.has("ai_image");
  const aiVideos = countVideos(sceneCount, input.videoSceneMode, hasVideo);
  const remaining = Math.max(0, sceneCount - aiVideos);
  const aiImageScenes = hasImage ? remaining : 0;
  const aiImages = aiImageScenes + aiVideos;

  if (input.dryRun) {
    const lines: JobCostLine[] = [
      { id: "llm", label: "Guion / LLM", usd: 0, detail: "dry run" },
      { id: "tts", label: "Voz / TTS", usd: 0, detail: "dry run" },
      { id: "image", label: "Imágenes", usd: 0, detail: "dry run" },
      { id: "video", label: "Video IA", usd: 0, detail: "dry run" },
      { id: "music", label: "Música", usd: 0, detail: "dry run" },
    ];
    return { lines, totalUsd: 0, sceneCount, ttsCharacters, aiImages, aiVideos };
  }

  const llmCost =
    llmCallCost(prices, input.llm, TOKEN.research) +
    llmCallCost(prices, input.llm, TOKEN.director) +
    llmCallCost(prices, input.llm, TOKEN.critic) +
    aiImages * llmCallCost(prices, input.llm, TOKEN.prompter) +
    aiVideos * llmCallCost(prices, input.llm, TOKEN.prompter);

  const ttsRate = (prices.tts[input.tts] ?? { per1kChars: 0 }).per1kChars;
  const ttsCost = (ttsCharacters / 1000) * ttsRate;

  const perImage = (prices.image[input.image] ?? { perImage: 0 }).perImage;
  const imageCost = aiImages * perImage;

  const videoKey = input.video && input.video.length > 0 ? input.video : "gemini";
  const perSecond = (prices.video[videoKey] ?? { perSecond: 0.05 }).perSecond;
  const videoCost = hasVideo ? aiVideos * 6 * perSecond : 0;

  const musicCost = input.music === "lyria" ? 0.08 : 0;

  const lines: JobCostLine[] = [
    {
      id: "llm",
      label: "Guion / LLM",
      usd: llmCost,
      detail: input.llm === "vivi"
        ? `vivi · ¥${VIVI_LLM_CNY.inputPer1M}/¥${VIVI_LLM_CNY.outputPer1M} por 1M`
        : `${input.llm}`,
    },
    { id: "tts", label: "Voz / TTS", usd: ttsCost, detail: `~${ttsCharacters} caracteres` },
    {
      id: "image",
      label: "Imágenes",
      usd: imageCost,
      detail: input.image === "vivi"
        ? `${aiImages} IA × ¥${VIVI_IMAGE_CNY.perImage}`
        : `${aiImages} IA × $${perImage.toFixed(3)}`,
    },
    { id: "video", label: "Video IA", usd: videoCost, detail: hasVideo ? `${aiVideos} clips × 6s` : "sin AI video" },
    { id: "music", label: "Música", usd: musicCost, detail: input.music === "lyria" ? "Lyria 3 Pro" : "bundled (gratis)" },
  ];

  const totalUsd = lines.reduce((s, l) => s + l.usd, 0);
  return { lines, totalUsd, sceneCount, ttsCharacters, aiImages, aiVideos };
}

export function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function formatCop(n: number): string {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    currencyDisplay: "code",
    maximumFractionDigits: 0,
  }).format(n);
}
