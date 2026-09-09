export const GFLOW_IMAGE_MODELS = [
  { id: "nano2", label: "Imagen Nano 2", note: "rápido, diario" },
  { id: "nano-pro", label: "Imagen Nano Pro", note: "más detalle" },
  { id: "image4", label: "Imagen 4", note: "máxima calidad" },
] as const;

export const GFLOW_VIDEO_MODELS = [
  { id: "veo-lite", label: "Veo Lite", note: "barato · default t2v", durations: [4, 6, 8] },
  { id: "veo-fast", label: "Veo Fast", note: "más rápido", durations: [4, 6, 8] },
  { id: "veo-quality", label: "Veo Quality", note: "mejor look", durations: [4, 6, 8] },
  { id: "omni-flash", label: "Omni Flash", note: "hasta 10s", durations: [4, 6, 8, 10] },
  { id: "veo-lite-lp", label: "Veo Lite LP", note: "low-power", durations: [4, 6, 8] },
] as const;

export const DEFAULT_GFLOW_IMAGE_MODEL = "nano2";
export const DEFAULT_GFLOW_VIDEO_MODEL = "veo-lite";
export const DEFAULT_GFLOW_VIDEO_MODE = "t2v";

export type GflowVideoMode = "t2v" | "i2v";

export function resolveGflowVideoMode(mode?: string): GflowVideoMode {
  return mode === "i2v" ? "i2v" : "t2v";
}

export function resolveGflowImageModel(id?: string): string {
  return GFLOW_IMAGE_MODELS.some((m) => m.id === id) ? id! : DEFAULT_GFLOW_IMAGE_MODEL;
}

export function resolveGflowVideoModel(id?: string): (typeof GFLOW_VIDEO_MODELS)[number] {
  return GFLOW_VIDEO_MODELS.find((m) => m.id === id) ?? GFLOW_VIDEO_MODELS[0];
}

export function pickGflowDuration(modelId: string, wanted?: number): number {
  const spec = resolveGflowVideoModel(modelId);
  const target = wanted ?? 6;
  if (spec.durations.includes(target as (typeof spec.durations)[number])) return target;
  return spec.durations.find((d) => d >= target) ?? spec.durations[spec.durations.length - 1] ?? 6;
}
