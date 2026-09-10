/** UI-side Kokoro mix spec. Mirrors src/providers/tts/kokoro-voices.ts */

export function serializeKokoroVoiceSpec(parts: { id: string; weight: number }[]): string {
  const positive = parts.filter((p) => p.weight > 0 && p.id);
  if (positive.length === 0) return "ef_dora";
  if (positive.length === 1) return positive[0]!.id;
  const sum = positive.reduce((s, p) => s + p.weight, 0) || 1;
  return positive.map((p) => `${p.id}:${Math.round((p.weight / sum) * 100)}`).join("+");
}

export function parseKokoroVoiceSpec(spec: string | undefined): { id: string; weight: number }[] {
  const raw = (spec ?? "ef_dora").trim() || "ef_dora";
  if (!raw.includes("+")) return [{ id: raw, weight: 100 }];
  const parsed = raw.split("+").map((chunk) => {
    const [idRaw, weightRaw] = chunk.split(":");
    const id = (idRaw ?? "").trim();
    const weight = weightRaw != null && weightRaw !== "" ? Number(weightRaw) : 1;
    return { id, weight: Number.isFinite(weight) && weight > 0 ? weight : 0 };
  }).filter((p) => p.id && p.weight > 0);
  const sum = parsed.reduce((s, p) => s + p.weight, 0) || 1;
  return parsed.map((p) => ({ id: p.id, weight: (p.weight / sum) * 100 }));
}

/** Mixes that tend to retain viewers on Spanish Shorts (not a real-person clone). */
export const KOKORO_SPANISH_MIX_PRESETS = [
  {
    id: "conexion",
    label: "Conexión",
    hint: "Cercana, con cuerpo",
    spec: "ef_dora:60+em_alex:30+em_santa:10",
    speed: 1.1,
  },
  {
    id: "explainer",
    label: "Explainer",
    hint: "Clara y rápida",
    spec: "ef_dora:70+em_alex:25+em_santa:5",
    speed: 1.0,
  },
  {
    id: "historia",
    label: "Historia",
    hint: "Narrador de documental",
    spec: "ef_dora:40+em_alex:25+em_santa:35",
    speed: 0.9,
  },
  {
    id: "autoridad",
    label: "Autoridad",
    hint: "Más grave, tech/news",
    spec: "ef_dora:20+em_alex:45+em_santa:35",
    speed: 1.0,
  },
] as const;

export const KOKORO_DEFAULT_CONNECT_MIX = KOKORO_SPANISH_MIX_PRESETS[0]!.spec;
