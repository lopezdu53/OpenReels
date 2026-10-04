import {
  resolveAtlasImageModel,
  resolveAtlasLlmModel,
  resolveAtlasTtsModel,
  resolveAtlasVideoModel,
} from "../providers/atlas/catalog.js";
import { gflowVideoCredits } from "../providers/gflow/catalog.js";
import { planMotionTakes } from "./catalog.js";
import type { StickmanCost, StickmanJobConfig, StickmanJobMeta, StickmanScript } from "./types.js";

export interface StickmanLlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export function llmUsageFromAtlas(raw: unknown): StickmanLlmUsage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const u = raw as {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  const prompt = Number(u.prompt_tokens ?? 0);
  const completion = Number(u.completion_tokens ?? 0);
  const total = Number(u.total_tokens ?? prompt + completion);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  return {
    promptTokens: Number.isFinite(prompt) ? prompt : 0,
    completionTokens: Number.isFinite(completion) ? completion : 0,
    totalTokens: total,
  };
}

export function llmUsd(modelId: string | undefined, usage: StickmanLlmUsage | undefined): number {
  if (!usage) return 0;
  const spec = resolveAtlasLlmModel(modelId);
  return (
    (usage.promptTokens * spec.inputPer1M + usage.completionTokens * spec.outputPer1M) / 1_000_000
  );
}

export function ttsUsd(modelId: string | undefined, chars: number): number {
  if (chars <= 0) return 0;
  return (chars / 1000) * resolveAtlasTtsModel(modelId).usdPer1kChars;
}

export function estimateStickmanCost(opts: {
  config: StickmanJobConfig;
  script?: StickmanScript | null;
  llmUsage?: StickmanLlmUsage;
  extraLlmUsage?: StickmanLlmUsage;
}): StickmanCost {
  const config = opts.config;
  const usage = mergeUsage(opts.llmUsage, opts.extraLlmUsage);
  const tokens = usage?.totalTokens ?? 0;
  let usd = llmUsd(config.llmModel, usage);
  const mute = config.muteCharacter === true;
  const narration = mute
    ? 0
    : (opts.script?.beats ?? []).map((beat) => beat.narration).join(" ").length;
  usd += ttsUsd(config.atlasTtsModel, narration);

  let credits = 0;
  if (config.animate && config.visualProvider === "gflow") {
    const takes = planMotionTakes([4, 6, 8, 10], config.durationSec);
    const model = config.gflowVideoModel || "omni-flash";
    credits = takes.reduce(
      (sum, sec) => sum + gflowVideoCredits({ modelId: model, durationSec: sec }),
      0,
    );
  } else if (config.animate && config.visualProvider !== "gflow") {
    usd += resolveAtlasVideoModel(config.videoModel).usdPerSecond * config.durationSec;
  }
  if (config.visualProvider !== "gflow") {
    const n = opts.script?.beats.length ?? 1;
    usd += resolveAtlasImageModel(config.imageModel).usd * n;
  }
  return {
    tokens,
    usd: Math.round(usd * 10_000) / 10_000,
    credits,
  };
}

export function mergeCost(prev: StickmanCost | undefined, next: StickmanCost): StickmanCost {
  if (!prev) return next;
  return {
    tokens: (prev.tokens ?? 0) + (next.tokens ?? 0),
    usd: Math.round(((prev.usd ?? 0) + (next.usd ?? 0)) * 10_000) / 10_000,
    credits: (prev.credits ?? 0) + (next.credits ?? 0),
  };
}

export function producedDurationMs(
  meta: Pick<StickmanJobMeta, "createdAt" | "completedAt">,
): number | null {
  if (!meta.completedAt) return null;
  const a = Date.parse(meta.createdAt);
  const b = Date.parse(meta.completedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return b - a;
}

function mergeUsage(a?: StickmanLlmUsage, b?: StickmanLlmUsage): StickmanLlmUsage | undefined {
  if (!a && !b) return undefined;
  return {
    promptTokens: (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0),
    completionTokens: (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0),
    totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
  };
}
