/** Creator yearly: $39 / 70,800 credits (sharpii.ai/pricing). */
export const SHARPII_CREDIT_USD = 39 / 70_800;

export function creditsToUsd(credits: number): number {
  return Math.round(credits * SHARPII_CREDIT_USD * 1000) / 1000;
}

export interface SharpiiImageModel {
  id: string;
  label: string;
  credits: number;
  refs: boolean;
  async?: boolean;
}

export interface SharpiiVideoModel {
  id: string;
  label: string;
  /** Flat credits per call, or credits for `refSeconds` when perSecond. */
  credits: number;
  durations: number[];
  perSecond?: boolean;
  refSeconds?: number;
  i2v: boolean;
}

export const SHARPII_IMAGE_MODELS: SharpiiImageModel[] = [
  { id: "nano-banana-2", label: "Nano Banana 2 (1K)", credits: 65, refs: true },
  { id: "nano-banana-2-2k", label: "Nano Banana 2 (2K)", credits: 85, refs: true },
  { id: "nano-banana-2-4k", label: "Nano Banana 2 (4K)", credits: 125, refs: true },
  { id: "nano-banana-pro", label: "Nano Banana Pro (1K)", credits: 125, refs: true },
  { id: "nano-banana-pro-2k", label: "Nano Banana Pro (2K)", credits: 135, refs: true },
  { id: "nano-banana-pro-4k", label: "Nano Banana Pro (4K)", credits: 215, refs: true },
  { id: "z-image-turbo", label: "Z-Image Turbo", credits: 50, refs: false },
  { id: "gpt-image-2", label: "GPT Image 2", credits: 190, refs: false },
  { id: "ideogram-v3", label: "Ideogram v3", credits: 70, refs: true },
  { id: "doubao-seedream-5-0-260128", label: "Seedream 5.0 (2K)", credits: 108, refs: true },
  { id: "doubao-seedream-5-0-3k", label: "Seedream 5.0 (3K)", credits: 192, refs: false, async: true },
  { id: "grok-image", label: "Grok Image 4", credits: 80, refs: false },
  { id: "mj-imagine", label: "Midjourney v7", credits: 89, refs: false },
  { id: "flux-1.1-pro", label: "Flux 1.1 Pro", credits: 240, refs: false, async: true },
  { id: "flux-pro", label: "Flux Pro", credits: 336, refs: false, async: true },
  { id: "flux-1.1-pro-ultra", label: "Flux 1.1 Pro Ultra", credits: 360, refs: false, async: true },
];

export const DEFAULT_SHARPII_IMAGE_MODEL = "nano-banana-2";

export const SHARPII_VIDEO_MODELS: SharpiiVideoModel[] = [
  { id: "kling-v2.6-pro-i2v", label: "Kling 2.6 Pro I2V (5/10s, sin audio)", credits: 684, durations: [5, 10], i2v: true },
  { id: "kling-v2.5-pro-i2v", label: "Kling 2.5 Pro I2V (5/10s)", credits: 684, durations: [5, 10], i2v: true },
  {
    id: "kling-3.0-pro-i2v",
    label: "Kling 3.0 Pro I2V (3–15s, sin audio)",
    credits: 1139,
    durations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    perSecond: true,
    refSeconds: 5,
    i2v: true,
  },
  {
    id: "seedance-2.0-fast-480p",
    label: "Seedance 2.0 Fast 480p (4–15s)",
    credits: 593,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    perSecond: true,
    refSeconds: 5,
    i2v: true,
  },
  {
    id: "seedance-2.0-fast-720p",
    label: "Seedance 2.0 Fast 720p (4–15s)",
    credits: 1276,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    perSecond: true,
    refSeconds: 5,
    i2v: true,
  },
  {
    id: "seedance-2.0-480p",
    label: "Seedance 2.0 480p (4–15s)",
    credits: 729,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    perSecond: true,
    refSeconds: 5,
    i2v: true,
  },
  {
    id: "seedance-2.0-720p",
    label: "Seedance 2.0 720p (4–15s)",
    credits: 1803,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    perSecond: true,
    refSeconds: 5,
    i2v: true,
  },
  {
    id: "sora-2",
    label: "Sora 2 (10/15s, audio nativo)",
    credits: 890,
    durations: [10, 15],
    perSecond: true,
    refSeconds: 10,
    i2v: true,
  },
];

export const DEFAULT_SHARPII_VIDEO_MODEL = "kling-v2.6-pro-i2v";

export function resolveSharpiiImageModel(id?: string): SharpiiImageModel {
  return SHARPII_IMAGE_MODELS.find((m) => m.id === id) ?? SHARPII_IMAGE_MODELS[0]!;
}

export function resolveSharpiiVideoModel(id?: string): SharpiiVideoModel {
  return SHARPII_VIDEO_MODELS.find((m) => m.id === id) ?? SHARPII_VIDEO_MODELS[0]!;
}

export function sharpiiImageUsd(id?: string): number {
  return creditsToUsd(resolveSharpiiImageModel(id).credits);
}

export function sharpiiVideoUsd(id?: string, durationSeconds = 5): number {
  const model = resolveSharpiiVideoModel(id);
  const credits = model.perSecond
    ? model.credits * (durationSeconds / (model.refSeconds ?? 5))
    : model.credits;
  return creditsToUsd(credits);
}

export function sharpiiVideoPerSecondUsd(id?: string): number {
  const model = resolveSharpiiVideoModel(id);
  if (model.perSecond) return creditsToUsd(model.credits / (model.refSeconds ?? 5));
  const dur = model.durations[0] ?? 5;
  return creditsToUsd(model.credits) / dur;
}
