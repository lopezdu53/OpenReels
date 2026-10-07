/** Cloudflare Workers AI catalog + USD list prices (docs, Oct 2026).
 * Billing is neurons on the backend; $0.011 / 1,000 neurons after 10k free/day.
 * https://developers.cloudflare.com/workers-ai/platform/pricing/
 */

export const CLOUDFLARE_NEURON_USD = 0.011 / 1_000;
export const CLOUDFLARE_FREE_NEURONS_PER_DAY = 10_000;

export const DEFAULT_CLOUDFLARE_LLM = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
export const DEFAULT_CLOUDFLARE_IMAGE = "@cf/black-forest-labs/flux-1-schnell";
export const DEFAULT_CLOUDFLARE_TTS = "@cf/deepgram/aura-2-es";
export const DEFAULT_CLOUDFLARE_TTS_SPEAKER = "aquila";

export const CLOUDFLARE_LLM_MODELS = [
  {
    id: "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
    label: "Llama 3.1 8B Fast",
    inputPer1M: 0.045,
    outputPer1M: 0.384,
    note: "barato, JSON OK",
    recommended: true,
  },
  {
    id: "@cf/zai-org/glm-4.7-flash",
    label: "GLM 4.7 Flash",
    inputPer1M: 0.06,
    outputPer1M: 0.4,
    note: "multilingüe",
  },
  {
    id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    label: "Llama 3.3 70B Fast",
    inputPer1M: 0.293,
    outputPer1M: 2.253,
    note: "calidad",
  },
  {
    id: "@cf/openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    inputPer1M: 0.2,
    outputPer1M: 0.3,
    note: "OpenAI open-weight",
  },
  {
    id: "@cf/openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    inputPer1M: 0.35,
    outputPer1M: 0.75,
    note: "paid-friendly",
  },
  {
    id: "@cf/google/gemma-3-12b-it",
    label: "Gemma 3 12B",
    inputPer1M: 0.345,
    outputPer1M: 0.556,
    note: "Google",
  },
] as const;

export const CLOUDFLARE_IMAGE_MODELS = [
  {
    id: "@cf/black-forest-labs/flux-1-schnell",
    label: "FLUX.1 Schnell",
    usdPerImage: 0.00085,
    note: "~8 tiles 9:16 + 4 steps",
    recommended: true,
  },
  {
    id: "@cf/black-forest-labs/flux-2-klein-4b",
    label: "FLUX.2 Klein 4B",
    usdPerImage: 0.0012,
    note: "rápido + refs",
  },
  {
    id: "@cf/leonardo/phoenix-1.0",
    label: "Leonardo Phoenix 1.0",
    usdPerImage: 0.024,
    note: "prompt adherence",
  },
  {
    id: "@cf/leonardo/lucid-origin",
    label: "Leonardo Lucid Origin",
    usdPerImage: 0.028,
    note: "gráfico / texto",
  },
] as const;

export const CLOUDFLARE_TTS_MODELS = [
  {
    id: "@cf/deepgram/aura-2-es",
    label: "Aura 2 ES",
    usdPer1kChars: 0.03,
    note: "español",
    recommended: true,
  },
  {
    id: "@cf/deepgram/aura-2-en",
    label: "Aura 2 EN",
    usdPer1kChars: 0.03,
    note: "inglés",
  },
  {
    id: "@cf/deepgram/aura-1",
    label: "Aura 1",
    usdPer1kChars: 0.015,
    note: "más barato",
  },
  {
    id: "@cf/myshell-ai/melotts",
    label: "MeloTTS",
    usdPer1kChars: 0.002,
    note: "~$0.0002 / min audio",
  },
] as const;

export const CLOUDFLARE_TTS_SPEAKERS_ES = [
  { id: "aquila", label: "Aquila", gender: "male" },
  { id: "alvaro", label: "Álvaro", gender: "male" },
  { id: "javier", label: "Javier", gender: "male" },
  { id: "nestor", label: "Néstor", gender: "male" },
  { id: "sirio", label: "Sirio", gender: "male" },
  { id: "carina", label: "Carina", gender: "female" },
  { id: "celeste", label: "Celeste", gender: "female" },
  { id: "diana", label: "Diana", gender: "female" },
  { id: "selena", label: "Selena", gender: "female" },
  { id: "estrella", label: "Estrella", gender: "female" },
] as const;

export const CLOUDFLARE_TTS_SPEAKERS_EN = [
  { id: "asteria", label: "Asteria", gender: "female" },
  { id: "luna", label: "Luna", gender: "female" },
  { id: "stella", label: "Stella", gender: "female" },
  { id: "athena", label: "Athena", gender: "female" },
  { id: "hera", label: "Hera", gender: "female" },
  { id: "orion", label: "Orion", gender: "male" },
  { id: "arcas", label: "Arcas", gender: "male" },
  { id: "perseus", label: "Perseus", gender: "male" },
  { id: "angus", label: "Angus", gender: "male" },
  { id: "helios", label: "Helios", gender: "male" },
] as const;

export function cloudflareLlmPricing(model?: string): { perInputToken: number; perOutputToken: number } {
  const spec = CLOUDFLARE_LLM_MODELS.find((m) => m.id === model) ?? CLOUDFLARE_LLM_MODELS[0]!;
  return {
    perInputToken: spec.inputPer1M / 1_000_000,
    perOutputToken: spec.outputPer1M / 1_000_000,
  };
}

export function cloudflareImageUsd(model?: string): number {
  return (CLOUDFLARE_IMAGE_MODELS.find((m) => m.id === model) ?? CLOUDFLARE_IMAGE_MODELS[0]!).usdPerImage;
}

export function cloudflareTtsPer1kChars(model?: string): number {
  return (CLOUDFLARE_TTS_MODELS.find((m) => m.id === model) ?? CLOUDFLARE_TTS_MODELS[0]!).usdPer1kChars;
}

export function resolveCloudflareLlm(id?: string): string {
  if (id && CLOUDFLARE_LLM_MODELS.some((m) => m.id === id)) return id;
  if (id?.startsWith("@cf/")) return id;
  return DEFAULT_CLOUDFLARE_LLM;
}

export function resolveCloudflareImage(id?: string): string {
  if (id && CLOUDFLARE_IMAGE_MODELS.some((m) => m.id === id)) return id;
  if (id?.startsWith("@cf/")) return id;
  return DEFAULT_CLOUDFLARE_IMAGE;
}

export function resolveCloudflareTts(id?: string): string {
  if (id && CLOUDFLARE_TTS_MODELS.some((m) => m.id === id)) return id;
  if (id?.startsWith("@cf/")) return id;
  return DEFAULT_CLOUDFLARE_TTS;
}
