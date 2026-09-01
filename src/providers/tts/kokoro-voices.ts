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
  const code = voice.at(0);
  return code === "a" || code === "b";
}
