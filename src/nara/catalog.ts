import { ATLAS_TTS_MODELS } from "../providers/atlas/catalog.js";
import {
  CLOUDFLARE_TTS_MODELS,
  CLOUDFLARE_TTS_SPEAKERS_EN,
  CLOUDFLARE_TTS_SPEAKERS_ES,
} from "../providers/cloudflare/catalog.js";
import type { TTSProviderKey } from "../schema/providers.js";
import { GEMINI_TTS_VOICES } from "../providers/tts/gemini.js";
import { GROK_TTS_VOICES } from "../providers/tts/grok.js";
import { INWORLD_VOICES } from "../providers/tts/inworld.js";
import { KOKORO_VOICES } from "../providers/tts/kokoro-voices.js";

export const NARA_DURATIONS = [15, 30, 45, 60, 90, 120] as const;
export type NaraDuration = (typeof NARA_DURATIONS)[number];

export const NARA_LANGUAGES = [
  { id: "es", label: "Español" },
  { id: "en", label: "English" },
  { id: "pt", label: "Português" },
  { id: "fr", label: "Français" },
] as const;

export const NARA_TONES = [
  { id: "neutral", label: "Neutral", hint: "claro, sin adornos" },
  { id: "energetic", label: "Energético", hint: "rápido, gancho, anuncio" },
  { id: "calm", label: "Calmado", hint: "suave, meditativo" },
  { id: "documentary", label: "Documental", hint: "autoridad, datos" },
  { id: "storyteller", label: "Narrador", hint: "cuento, pausas" },
  { id: "news", label: "Noticiero", hint: "titular, directo" },
  { id: "commercial", label: "Comercial", hint: "venta, CTA" },
] as const;

export const OPENAI_TTS_MODELS = [
  { id: "gpt-4o-mini-tts", label: "GPT-4o mini TTS (instrucciones de tono)" },
  { id: "tts-1", label: "TTS-1 (rápido)" },
  { id: "tts-1-hd", label: "TTS-1 HD" },
] as const;

export const OPENAI_TTS_VOICES = [
  { id: "alloy", label: "Alloy — Neutral", gender: "neutral" },
  { id: "ash", label: "Ash — Grave", gender: "male" },
  { id: "ballad", label: "Ballad — Cálido", gender: "male" },
  { id: "coral", label: "Coral — Brillante", gender: "female" },
  { id: "echo", label: "Echo — Claro", gender: "male" },
  { id: "fable", label: "Fable — Británico", gender: "neutral" },
  { id: "nova", label: "Nova — Energética", gender: "female" },
  { id: "onyx", label: "Onyx — Profundo", gender: "male" },
  { id: "sage", label: "Sage — Sereno", gender: "neutral" },
  { id: "shimmer", label: "Shimmer — Alegre", gender: "female" },
  { id: "verse", label: "Verse — Expresivo", gender: "neutral" },
] as const;

export const ELEVENLABS_VOICES = [
  { id: "yl2ZDV1MzN4HbQJbMihG", label: "Default OpenReels", gender: "neutral", lang: "multi" },
  { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel — Calmada", gender: "female", lang: "en" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella — Suave", gender: "female", lang: "en" },
  { id: "ErXwobaYiN019PkySvjV", label: "Antoni — Narrador", gender: "male", lang: "en" },
  { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli — Juvenil", gender: "female", lang: "en" },
  { id: "TxGEqnHWrfWFTfGW9XjX", label: "Josh — Cercano", gender: "male", lang: "en" },
  { id: "VR6AewLTigWG4xSOukaG", label: "Arnold — Grave", gender: "male", lang: "en" },
  { id: "pNInz6obpgDQGcFmaJgB", label: "Adam — Noticiero", gender: "male", lang: "en" },
  { id: "yoZ06aMxZJJ28mfd3POQ", label: "Sam — Ligero", gender: "male", lang: "en" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte — Francés", gender: "female", lang: "fr" },
  { id: "IKne3meq5aSn9XLyUdCD", label: "Charlie — Australiano", gender: "male", lang: "en" },
  { id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel — Británico", gender: "male", lang: "en" },
] as const;

export const INWORLD_TTS_MODELS = [
  { id: "inworld-tts-1.5-max", label: "Inworld 1.5 Max" },
  { id: "inworld-tts-1", label: "Inworld TTS 1" },
] as const;

export const GEMINI_TTS_MODELS = [
  { id: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash TTS" },
] as const;

export interface NaraVoiceOpt {
  id: string;
  label: string;
  gender?: string;
  language?: string;
}

export interface NaraModelOpt {
  id: string;
  label: string;
  note?: string;
  usdPer1kChars?: number;
  voices?: NaraVoiceOpt[];
}

export interface NaraTtsProviderCatalog {
  key: TTSProviderKey;
  label: string;
  category: string;
  hint: string;
  readyEnv: string;
  controls: {
    voices: boolean;
    models: boolean;
    speed: boolean;
    language: boolean;
    tone: boolean;
    stability: boolean;
    customVoice: boolean;
  };
  defaultVoice?: string;
  defaultModel?: string;
  defaultSpeed?: number;
  speedMin?: number;
  speedMax?: number;
  voices: NaraVoiceOpt[];
  models: NaraModelOpt[];
}

export const NARA_TTS_PROVIDERS: NaraTtsProviderCatalog[] = [
  {
    key: "kokoro",
    label: "Kokoro (local)",
    category: "Local · gratis",
    hint: "ONNX en el worker. Español e inglés. Mezcla de voces en el Lab.",
    readyEnv: "none",
    controls: {
      voices: true,
      models: false,
      speed: true,
      language: false,
      tone: false,
      stability: false,
      customVoice: false,
    },
    defaultVoice: "ef_dora",
    defaultSpeed: 1.1,
    speedMin: 0.5,
    speedMax: 2,
    voices: KOKORO_VOICES.map((v) => ({
      id: v.id,
      label: v.label,
      gender: v.gender,
      language: v.language,
    })),
    models: [],
  },
  {
    key: "cloudflare-tts",
    label: "Cloudflare Aura",
    category: "Cloudflare Workers AI",
    hint: "Aura 2 ES/EN y MeloTTS. Token Workers AI.",
    readyEnv: "CLOUDFLARE_API_TOKEN",
    controls: {
      voices: true,
      models: true,
      speed: false,
      language: false,
      tone: false,
      stability: false,
      customVoice: false,
    },
    defaultVoice: "aquila",
    defaultModel: "@cf/deepgram/aura-2-es",
    voices: [
      ...CLOUDFLARE_TTS_SPEAKERS_ES.map((v) => ({
        id: v.id,
        label: `${v.label} (ES)`,
        gender: v.gender,
        language: "es",
      })),
      ...CLOUDFLARE_TTS_SPEAKERS_EN.map((v) => ({
        id: v.id,
        label: `${v.label} (EN)`,
        gender: v.gender,
        language: "en",
      })),
    ],
    models: CLOUDFLARE_TTS_MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      note: m.note,
      usdPer1kChars: m.usdPer1kChars,
    })),
  },
  {
    key: "atlas-tts",
    label: "Atlas Cloud",
    category: "Atlas",
    hint: "xAI, Gemini y MiniMax. Idioma y velocidad.",
    readyEnv: "ATLASCLOUD_API_KEY",
    controls: {
      voices: true,
      models: true,
      speed: true,
      language: true,
      tone: false,
      stability: false,
      customVoice: false,
    },
    defaultVoice: "eve",
    defaultModel: "xai/tts-v1",
    defaultSpeed: 1,
    speedMin: 0.7,
    speedMax: 1.5,
    voices: [],
    models: ATLAS_TTS_MODELS.map((m) => ({
      id: m.id,
      label: m.label,
      usdPer1kChars: m.usdPer1kChars,
      voices: m.voices.map((v) => ({
        id: v.id,
        label: v.label,
        gender: v.gender,
      })),
    })),
  },
  {
    key: "grok-tts",
    label: "Grok TTS (xAI)",
    category: "xAI",
    hint: "Voces Eve/Leo y más. Velocidad e idioma auto.",
    readyEnv: "XAI_API_KEY",
    controls: {
      voices: true,
      models: false,
      speed: true,
      language: true,
      tone: false,
      stability: false,
      customVoice: false,
    },
    defaultVoice: "eve",
    defaultSpeed: 1,
    speedMin: 0.7,
    speedMax: 1.5,
    voices: GROK_TTS_VOICES.map((v) => ({ id: v.id, label: v.label, gender: v.gender })),
    models: [],
  },
  {
    key: "gemini-tts",
    label: "Gemini TTS",
    category: "Google",
    hint: "Voces prebuilt (Kore, Puck…). Tono va en el guion.",
    readyEnv: "GOOGLE_API_KEY",
    controls: {
      voices: true,
      models: true,
      speed: false,
      language: false,
      tone: true,
      stability: false,
      customVoice: false,
    },
    defaultVoice: "Kore",
    defaultModel: "gemini-2.5-flash-preview-tts",
    voices: GEMINI_TTS_VOICES.map((v) => ({ id: v.id, label: v.label, gender: v.gender })),
    models: GEMINI_TTS_MODELS.map((m) => ({ id: m.id, label: m.label })),
  },
  {
    key: "openai-tts",
    label: "OpenAI TTS",
    category: "OpenAI",
    hint: "gpt-4o-mini-tts admite instrucciones de tono. Velocidad 0.25–4.",
    readyEnv: "OPENAI_API_KEY",
    controls: {
      voices: true,
      models: true,
      speed: true,
      language: false,
      tone: true,
      stability: false,
      customVoice: false,
    },
    defaultVoice: "alloy",
    defaultModel: "gpt-4o-mini-tts",
    defaultSpeed: 1,
    speedMin: 0.25,
    speedMax: 4,
    voices: OPENAI_TTS_VOICES.map((v) => ({ id: v.id, label: v.label, gender: v.gender })),
    models: OPENAI_TTS_MODELS.map((m) => ({ id: m.id, label: m.label })),
  },
  {
    key: "elevenlabs",
    label: "ElevenLabs",
    category: "ElevenLabs",
    hint: "Multilingual v2. Estabilidad, estilo y voice ID propio.",
    readyEnv: "ELEVENLABS_API_KEY",
    controls: {
      voices: true,
      models: false,
      speed: true,
      language: false,
      tone: false,
      stability: true,
      customVoice: true,
    },
    defaultVoice: "yl2ZDV1MzN4HbQJbMihG",
    defaultSpeed: 1,
    speedMin: 0.7,
    speedMax: 1.2,
    voices: ELEVENLABS_VOICES.map((v) => ({
      id: v.id,
      label: v.label,
      gender: v.gender,
      language: v.lang,
    })),
    models: [{ id: "eleven_multilingual_v2", label: "Multilingual v2" }],
  },
  {
    key: "inworld",
    label: "Inworld",
    category: "Inworld",
    hint: "Voces ES-US / ES-MX / EN. Modelo Max o TTS 1.",
    readyEnv: "INWORLD_TTS_API_KEY",
    controls: {
      voices: true,
      models: true,
      speed: false,
      language: false,
      tone: false,
      stability: false,
      customVoice: false,
    },
    defaultVoice: "Pedro",
    defaultModel: "inworld-tts-1.5-max",
    voices: INWORLD_VOICES.map((v) => ({
      id: v.id,
      label: v.label,
      language: v.lang,
    })),
    models: INWORLD_TTS_MODELS.map((m) => ({ id: m.id, label: m.label })),
  },
];

export const DEFAULT_NARA_TTS: TTSProviderKey = "kokoro";

export function isNaraTtsKey(key: string): key is TTSProviderKey {
  return NARA_TTS_PROVIDERS.some((p) => p.key === key);
}

export function naraProvider(key: string): NaraTtsProviderCatalog {
  return NARA_TTS_PROVIDERS.find((p) => p.key === key) ?? NARA_TTS_PROVIDERS[0]!;
}

export function isNaraDuration(n: number): n is NaraDuration {
  return (NARA_DURATIONS as readonly number[]).includes(n);
}

export function isNaraLanguage(id: string): boolean {
  return NARA_LANGUAGES.some((l) => l.id === id);
}

export function isNaraTone(id: string): boolean {
  return NARA_TONES.some((t) => t.id === id);
}

export function targetWordCount(durationSec: number): number {
  return Math.max(20, Math.round((durationSec * 150) / 60));
}

export function naraReadyFlags(): Record<string, boolean> {
  return {
    kokoro: true,
    "cloudflare-tts": Boolean(process.env["CLOUDFLARE_API_TOKEN"] && process.env["CLOUDFLARE_ACCOUNT_ID"]),
    "atlas-tts": Boolean(process.env["ATLASCLOUD_API_KEY"]),
    "grok-tts": Boolean(process.env["XAI_API_KEY"]),
    "gemini-tts": Boolean(process.env["GOOGLE_API_KEY"]),
    "openai-tts": Boolean(process.env["OPENAI_API_KEY"]),
    elevenlabs: Boolean(process.env["ELEVENLABS_API_KEY"]),
    inworld: Boolean(process.env["INWORLD_TTS_API_KEY"]),
    llm: Boolean(
      process.env["ATLASCLOUD_API_KEY"] ||
        process.env["GOOGLE_API_KEY"] ||
        process.env["ANTHROPIC_API_KEY"] ||
        process.env["OPENAI_API_KEY"] ||
        process.env["XAI_API_KEY"] ||
        process.env["CLOUDFLARE_API_TOKEN"],
    ),
  };
}
