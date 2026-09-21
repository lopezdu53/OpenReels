export const GFLOW_IMAGE_MODELS = [
  { id: "nano-pro", label: "Nano Banana Pro", note: "mejor palito", credits: 0 },
  { id: "nano2", label: "Nano Banana 2", note: "equilibrado", credits: 0 },
  { id: "nano-lite", label: "Nano Banana 2 Lite", note: "rápido", credits: 0 },
] as const;

export const GFLOW_VIDEO_MODELS = [
  {
    id: "omni-flash",
    label: "Omni 1.1 Flash",
    note: "mejor plano continuo · 4–10s · se encadena",
    durations: [4, 6, 8, 10],
    creditPerSecond: 2,
  },
  {
    id: "veo-lite",
    label: "Veo 3.1 Lite",
    note: "barato · 4–8s (Flow no pide duración)",
    durations: [4, 6, 8],
    creditPerSecond: 5,
  },
  {
    id: "veo-fast",
    label: "Veo 3.1 Fast",
    note: "más rápido · 4–8s",
    durations: [4, 6, 8],
    creditPerSecond: 10,
  },
  {
    id: "veo-quality",
    label: "Veo 3.1 Quality",
    note: "mejor look Veo · 4–8s",
    durations: [4, 6, 8],
    creditPerSecond: 20,
  },
  {
    id: "veo-lite-lp",
    label: "Veo 3.1 Lite LP",
    note: "low-power · 4–8s",
    durations: [4, 6, 8],
    creditPerSecond: 3,
  },
] as const;

export const DEFAULT_GFLOW_IMAGE_MODEL = "nano2";
export const DEFAULT_GFLOW_VIDEO_MODEL = "veo-lite";
export const DEFAULT_GFLOW_VIDEO_MODE = "t2v";

const IMAGE_ALIASES: Record<string, string> = {
  image4: "nano-lite",
  "nano-banana-pro": "nano-pro",
  "banana-pro": "nano-pro",
  "nano-banana-2": "nano2",
  "nano-banana-2-lite": "nano-lite",
};

export type GflowVideoMode = "t2v" | "i2v";

export function resolveGflowVideoMode(mode?: string): GflowVideoMode {
  return mode === "i2v" ? "i2v" : "t2v";
}

export function resolveGflowImageModel(id?: string): string {
  if (!id) return DEFAULT_GFLOW_IMAGE_MODEL;
  const aliased = IMAGE_ALIASES[id] ?? id;
  return GFLOW_IMAGE_MODELS.some((m) => m.id === aliased) ? aliased : DEFAULT_GFLOW_IMAGE_MODEL;
}

/** gflow-cli still accepts image4 for the lite slot. */
export function gflowImageCliId(id?: string): string {
  const resolved = resolveGflowImageModel(id);
  return resolved === "nano-lite" ? "image4" : resolved;
}

export function resolveGflowVideoModel(id?: string): (typeof GFLOW_VIDEO_MODELS)[number] {
  return (
    GFLOW_VIDEO_MODELS.find((m) => m.id === id) ??
    GFLOW_VIDEO_MODELS.find((m) => m.id === DEFAULT_GFLOW_VIDEO_MODEL) ??
    GFLOW_VIDEO_MODELS[0]
  );
}

export function pickGflowDuration(modelId: string, wanted?: number): number {
  const spec = resolveGflowVideoModel(modelId);
  const target = wanted ?? 6;
  if (spec.durations.includes(target as (typeof spec.durations)[number])) return target;
  return spec.durations.find((d) => d >= target) ?? spec.durations[spec.durations.length - 1] ?? 6;
}

/** gflow 0.71: `--duration` only exists on Omni Flash. Veo has no duration row. */
export function gflowSupportsDurationFlag(modelId?: string): boolean {
  return resolveGflowVideoModel(modelId).id === "omni-flash";
}

/** Seconds to pass as `--duration`, or undefined to accept Flow's default. */
export function gflowCliDuration(modelId?: string, wanted?: number): number | undefined {
  if (!gflowSupportsDurationFlag(modelId)) return undefined;
  return pickGflowDuration(modelId ?? "omni-flash", wanted);
}

export const GFLOW_DEFAULT_CLIP_SECONDS = 8;

export function gflowVideoCredits(opts: {
  modelId: string;
  durationSec: number;
  resolution?: "360p" | "720p";
  variants?: 1 | 2 | 3 | 4;
}): number {
  const spec = resolveGflowVideoModel(opts.modelId);
  const seconds = pickGflowDuration(opts.modelId, opts.durationSec);
  const resMul = opts.resolution === "360p" ? 0.5 : 1;
  const variants = opts.variants ?? 1;
  return Math.round(spec.creditPerSecond * seconds * resMul * variants);
}

export function gflowImageCredits(_modelId?: string): number {
  return 0;
}

/** One scene at a time: gflow Imagen still → wait for Flow I2V → next still. */
export function shouldSerializeGflowI2v(videoProvider?: string, mode?: string): boolean {
  return videoProvider === "gflow" && resolveGflowVideoMode(mode) === "i2v";
}

export function gflowI2vFallbackT2vEnabled(): boolean {
  return process.env["GFLOW_I2V_FALLBACK_T2V"] === "1";
}

const I2V_FALLBACK_NEEDLES = [
  "uiselectordrifterror",
  "frame picker",
  "maseq",
  "initial-frame",
  "still.png",
  "or-i2v-",
];

/** Local-file I2V on migrated Flow often uploads the still then dies in the picker. */
export function gflowI2vShouldFallbackT2v(message: string): boolean {
  const low = message.toLowerCase();
  return I2V_FALLBACK_NEEDLES.some((n) => low.includes(n));
}
