export const KOKORO_VOICES = [
  { id: "ef_dora", label: "Dora — Español (F)", language: "es", gender: "female" },
  { id: "em_alex", label: "Alex — Español (M)", language: "es", gender: "male" },
  { id: "em_santa", label: "Santa — Español (M)", language: "es", gender: "male" },
  { id: "af_heart", label: "Heart — English US (F)", language: "en-us", gender: "female" },
  { id: "af_bella", label: "Bella — English US (F)", language: "en-us", gender: "female" },
  { id: "af_nicole", label: "Nicole — English US (F)", language: "en-us", gender: "female" },
  { id: "af_sarah", label: "Sarah — English US (F)", language: "en-us", gender: "female" },
  { id: "af_sky", label: "Sky — English US (F)", language: "en-us", gender: "female" },
  { id: "am_fenrir", label: "Fenrir — English US (M)", language: "en-us", gender: "male" },
  { id: "am_michael", label: "Michael — English US (M)", language: "en-us", gender: "male" },
  { id: "am_puck", label: "Puck — English US (M)", language: "en-us", gender: "male" },
  { id: "bf_emma", label: "Emma — English UK (F)", language: "en-gb", gender: "female" },
  { id: "bf_alice", label: "Alice — English UK (F)", language: "en-gb", gender: "female" },
  { id: "bm_george", label: "George — English UK (M)", language: "en-gb", gender: "male" },
  { id: "bm_daniel", label: "Daniel — English UK (M)", language: "en-gb", gender: "male" },
] as const;

export type KokoroVoiceId = (typeof KOKORO_VOICES)[number]["id"];

export const DEFAULT_KOKORO_VOICE: KokoroVoiceId = "ef_dora";

export const KOKORO_SPANISH_VOICE_IDS = ["ef_dora", "em_alex", "em_santa"] as const;

export interface KokoroVoicePart {
  id: string;
  weight: number;
}

export interface KokoroVoiceBlend {
  parts: KokoroVoicePart[];
  primaryId: string;
}

/** `ef_dora` or blended `ef_dora:70+em_alex:30`. */
export function parseKokoroVoiceSpec(spec: string | undefined): KokoroVoiceBlend {
  const raw = (spec ?? DEFAULT_KOKORO_VOICE).trim() || DEFAULT_KOKORO_VOICE;
  if (!raw.includes("+")) {
    return { parts: [{ id: raw, weight: 1 }], primaryId: raw };
  }
  const parsed = raw
    .split("+")
    .map((chunk) => {
      const [idRaw, weightRaw] = chunk.split(":");
      const id = (idRaw ?? "").trim();
      const weight = weightRaw != null && weightRaw !== "" ? Number(weightRaw) : 1;
      return { id, weight: Number.isFinite(weight) && weight > 0 ? weight : 0 };
    })
    .filter((p) => p.id && p.weight > 0);
  if (parsed.length === 0) {
    return { parts: [{ id: DEFAULT_KOKORO_VOICE, weight: 1 }], primaryId: DEFAULT_KOKORO_VOICE };
  }
  const sum = parsed.reduce((s, p) => s + p.weight, 0);
  const parts = parsed.map((p) => ({ id: p.id, weight: p.weight / sum }));
  const primaryId = [...parts].sort((a, b) => b.weight - a.weight)[0]!.id;
  return { parts, primaryId };
}

export function serializeKokoroVoiceSpec(parts: KokoroVoicePart[]): string {
  const positive = parts.filter((p) => p.weight > 0 && p.id);
  if (positive.length === 0) return DEFAULT_KOKORO_VOICE;
  if (positive.length === 1) return positive[0]!.id;
  const sum = positive.reduce((s, p) => s + p.weight, 0) || 1;
  return positive.map((p) => `${p.id}:${Math.round((p.weight / sum) * 100)}`).join("+");
}

export function mixVoiceEmbeddings(parts: { data: Float32Array; weight: number }[]): Float32Array {
  if (parts.length === 0) throw new Error("No Kokoro voice embeddings to mix");
  const len = Math.min(...parts.map((p) => p.data.length));
  const out = new Float32Array(len);
  for (const part of parts) {
    for (let i = 0; i < len; i++) {
      out[i] = (out[i] ?? 0) + (part.data[i] ?? 0) * part.weight;
    }
  }
  return out;
}

/** eSpeak-ng voice id for non-English Kokoro voices (not phonemizer.js — that build is English-only). */
export const KOKORO_LANG_TO_PHONEME: Record<string, string> = {
  a: "en-us",
  b: "en",
  e: "es",
  f: "fr-fr",
  h: "hi",
  i: "it",
  j: "ja",
  p: "pt-br",
  z: "cmn",
};

export function isKokoroEnglishVoice(voice: string): boolean {
  const code = parseKokoroVoiceSpec(voice).primaryId.at(0);
  return code === "a" || code === "b";
}
