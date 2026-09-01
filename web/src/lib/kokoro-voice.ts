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
