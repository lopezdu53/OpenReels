export interface RunPodImageModel {
  id: string;
  label: string;
  kind: "public" | "custom";
  costHint: string;
  defaultSteps?: number;
  maxSteps?: number;
  defaultGuidance?: number;
  sizeMode: "wh" | "preset" | "aspect";
}

export interface RunPodVideoModel {
  id: string;
  label: string;
  kind: "public" | "custom";
  costHint: string;
  durations: number[];
  resolutions: string[];
  /** How the public endpoint expects output size. */
  sizeParam: "size" | "resolution" | "none";
  /**
   * WaveSpeed proxies (Pruna / p-video) validate `{ input: { prompt, image, ... } }`
   * after RunPod unwraps the top-level `{ input: ... }` envelope.
   */
  nestedInput?: boolean;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Older AI-SDK-style IDs → current REST public-endpoint slugs. */
const IMAGE_ALIASES: Record<string, string> = {
  "tongyi-mai/z-image-turbo": "z-image-turbo",
  "bytedance-seedream-4-0-t2i": "seedream-v4-t2i",
  "black-forest-labs/flux-1-schnell": "black-forest-labs-flux-1-schnell",
  "black-forest-labs/flux-1-dev": "black-forest-labs-flux-1-dev",
};

const VIDEO_ALIASES: Record<string, string> = {
  "alibaba/wan-2.2-i2v-720": "wan-2-2-i2v-720",
  "alibaba/wan-2.5": "wan-2-5",
  "alibaba/wan-2.6-i2v": "wan-2-6-i2v",
  "bytedance/seedance-v1.5-pro-i2v": "seedance-v1-5-pro-i2v",
  "kwaivgi/kling-v2.1-i2v-pro": "kling-v2-1-i2v-pro",
};

/** Current RunPod Public Endpoints for text-to-image (Sep 2026). */
export const RUNPOD_IMAGE_MODELS: RunPodImageModel[] = [
  {
    id: "black-forest-labs-flux-1-schnell",
    label: "FLUX Schnell — más barato",
    kind: "public",
    costHint: "~$0.0025 / imagen",
    defaultSteps: 4,
    maxSteps: 8,
    defaultGuidance: 1,
    sizeMode: "wh",
  },
  {
    id: "p-image-t2i",
    label: "P-Image T2I — ultra rápido",
    kind: "public",
    costHint: "$0.005 / imagen",
    sizeMode: "aspect",
  },
  {
    id: "z-image-turbo",
    label: "Z-Image Turbo",
    kind: "public",
    costHint: "$0.005 / imagen",
    sizeMode: "preset",
  },
  {
    id: "black-forest-labs-flux-1-dev",
    label: "FLUX Dev — calidad",
    kind: "public",
    costHint: "~$0.02 / MP",
    defaultSteps: 28,
    maxSteps: 50,
    defaultGuidance: 7.5,
    sizeMode: "wh",
  },
  {
    id: "qwen-image-t2i",
    label: "Qwen Image — texto en imagen",
    kind: "public",
    costHint: "$0.02 / imagen",
    sizeMode: "preset",
  },
  {
    id: "seedream-v4-t2i",
    label: "Seedream 4.0",
    kind: "public",
    costHint: "$0.027 / imagen",
    sizeMode: "preset",
  },
  {
    id: "custom",
    label: "Endpoint propio (Serverless)",
    kind: "custom",
    costHint: "tu GPU / tu precio",
    sizeMode: "wh",
  },
];

/** Image-to-video public endpoints. OpenReels always starts from a still. */
export const RUNPOD_VIDEO_MODELS: RunPodVideoModel[] = [
  {
    id: "p-video",
    label: "Pruna Video — más barato",
    kind: "public",
    costHint: "$0.02/s 720p",
    durations: [5, 8, 10],
    resolutions: ["720p", "1080p"],
    sizeParam: "resolution",
    nestedInput: true,
  },
  {
    id: "seedance-v1-5-pro-i2v",
    label: "Seedance 1.5 Pro I2V",
    kind: "public",
    costHint: "$0.024–$0.052/s",
    durations: [4, 5, 8, 10, 12],
    resolutions: ["480p", "720p"],
    sizeParam: "resolution",
  },
  {
    id: "wan-2-2-i2v-720",
    label: "Wan 2.2 I2V 720p",
    kind: "public",
    costHint: "$0.30 / 5s",
    durations: [5, 8, 10, 15],
    resolutions: ["720p"],
    sizeParam: "size",
  },
  {
    id: "wan-2-5",
    label: "Wan 2.5 I2V",
    kind: "public",
    costHint: "$0.25–$1.50",
    durations: [5, 10],
    resolutions: ["480p", "720p", "1080p"],
    sizeParam: "size",
  },
  {
    id: "wan-2-6-i2v",
    label: "Wan 2.6 I2V — último Wan",
    kind: "public",
    costHint: "$0.10/s 720p",
    durations: [5, 10, 15],
    resolutions: ["720p", "1080p"],
    sizeParam: "size",
  },
  {
    id: "kling-v2-1-i2v-pro",
    label: "Kling 2.1 I2V Pro",
    kind: "public",
    costHint: "$0.45 / 5s",
    durations: [5, 10],
    resolutions: ["720p"],
    sizeParam: "none",
  },
  {
    id: "custom",
    label: "Endpoint propio (Serverless)",
    kind: "custom",
    costHint: "tu GPU / tu precio",
    durations: [2, 3, 4, 5, 6, 8],
    resolutions: ["720p", "1080p"],
    sizeParam: "size",
  },
];

export const DEFAULT_RUNPOD_IMAGE_MODEL = "black-forest-labs-flux-1-schnell";
export const DEFAULT_RUNPOD_VIDEO_MODEL = "p-video";

export function canonicalizeRunPodImageModelId(id: string | undefined): string {
  if (!id) return DEFAULT_RUNPOD_IMAGE_MODEL;
  return IMAGE_ALIASES[id] ?? id;
}

export function canonicalizeRunPodVideoModelId(id: string | undefined): string {
  if (!id) return DEFAULT_RUNPOD_VIDEO_MODEL;
  return VIDEO_ALIASES[id] ?? id;
}

export function getRunPodImageModel(id: string | undefined): RunPodImageModel {
  const canonical = canonicalizeRunPodImageModelId(id);
  return RUNPOD_IMAGE_MODELS.find((m) => m.id === canonical) ?? RUNPOD_IMAGE_MODELS[0]!;
}

export function getRunPodVideoModel(id: string | undefined): RunPodVideoModel {
  const canonical = canonicalizeRunPodVideoModelId(id);
  return RUNPOD_VIDEO_MODELS.find((m) => m.id === canonical) ?? RUNPOD_VIDEO_MODELS[0]!;
}

/** True for public-endpoint slugs (not a custom serverless UUID). */
export function isRunPodPublicModelId(id: string): boolean {
  if (!id || id === "custom") return false;
  if (UUID_RE.test(id)) return false;
  return true;
}
