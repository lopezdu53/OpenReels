import type { TTSProvider, TTSResult, WordTimestamp } from "../../schema/providers.js";

const XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_VOICE = "eve";
const MAX_INPUT_CHARS = 15_000;
const REQUEST_TIMEOUT_MS = 60_000;

export const GROK_TTS_VOICES_FALLBACK = [
  { id: "eve", label: "Eve — Energetic, upbeat (F)", gender: "female" },
  { id: "ara", label: "Ara — Warm, friendly (F)", gender: "female" },
  { id: "luna", label: "Luna — Gentle, nurturing (F)", gender: "female" },
  { id: "carina", label: "Carina — Soft, empathetic (F)", gender: "female" },
  { id: "aurora", label: "Aurora — Serene, radiant (F)", gender: "female" },
  { id: "liora", label: "Liora — Calm, luminous (F)", gender: "female" },
  { id: "iris", label: "Iris — Friendly, upbeat (F)", gender: "female" },
  { id: "celeste", label: "Celeste — Compassionate, reassuring (F)", gender: "female" },
  { id: "rex", label: "Rex — Confident, clear (M)", gender: "male" },
  { id: "sal", label: "Sal — Smooth, balanced (M)", gender: "male" },
  { id: "leo", label: "Leo — Authoritative, strong (M)", gender: "male" },
  { id: "atlas", label: "Atlas — Confident, commanding (M)", gender: "male" },
  { id: "orion", label: "Orion — Rich, cinematic (M)", gender: "male" },
  { id: "helix", label: "Helix — Bold, dynamic (M)", gender: "male" },
  { id: "zagan", label: "Zagan — Powerful, dramatic (M)", gender: "male" },
  { id: "perseus", label: "Perseus — Strong, trustworthy (M)", gender: "male" },
  { id: "helios", label: "Helios — Upbeat, energetic (M)", gender: "male" },
  { id: "altair", label: "Altair — Elegant, refined (M)", gender: "male" },
  { id: "zenith", label: "Zenith — Sharp, focused (M)", gender: "male" },
  { id: "lux", label: "Lux — Grounded, calm (M)", gender: "male" },
  { id: "kepler", label: "Kepler — Inventive, charismatic (M)", gender: "male" },
  { id: "rigel", label: "Rigel — Precise, professional (M)", gender: "male" },
  { id: "cosmo", label: "Cosmo — Bright, curious (M)", gender: "male" },
  { id: "ursa", label: "Ursa — Friendly, steadfast (M)", gender: "male" },
  { id: "sirius", label: "Sirius — Quick-witted, playful (M)", gender: "male" },
  { id: "lumen", label: "Lumen — Warm, articulate (M)", gender: "male" },
  { id: "castor", label: "Castor — Charismatic, easygoing (M)", gender: "male" },
  { id: "naksh", label: "Naksh — Warm, thoughtful (M)", gender: "male" },
] as const;

export const GROK_TTS_VOICES = GROK_TTS_VOICES_FALLBACK;

/** xAI TTS has no model selector — kept empty so older UIs don't crash. */
export const GROK_TTS_MODELS: { id: string; label: string }[] = [];

export type GrokTTSVoice = (typeof GROK_TTS_VOICES)[number]["id"];

interface TimedTtsPayload {
  audio?: string;
  duration?: number;
  audio_timestamps?: {
    graph_chars?: string[];
    graph_times?: number[][];
  };
}

/** Group character-level xAI timestamps into word-level captions. */
export function charsToWords(graphChars: string[], graphTimes: number[][]): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  let current = "";
  let start = 0;
  let end = 0;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) words.push({ word: trimmed, start, end });
    current = "";
  };

  for (let i = 0; i < graphChars.length; i++) {
    const ch = graphChars[i] ?? "";
    const pair = graphTimes[i];
    const t0 = pair?.[0] ?? end;
    const t1 = pair?.[1] ?? t0;
    if (/^\s+$/.test(ch)) {
      flush();
      continue;
    }
    if (!current) start = t0;
    current += ch;
    end = t1;
  }
  flush();
  return words;
}

/** Fetch available voices from xAI API (includes custom voices). */
export async function fetchGrokTtsVoices(
  apiKey: string,
): Promise<Array<{ id: string; label: string; gender: string }>> {
  try {
    const res = await fetch(`${XAI_BASE_URL}/tts/voices`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return [...GROK_TTS_VOICES_FALLBACK];
    const data = (await res.json()) as {
      voices?: Array<{ voice_id: string; name?: string; gender?: string }>;
    };
    if (!Array.isArray(data.voices) || data.voices.length === 0) {
      return [...GROK_TTS_VOICES_FALLBACK];
    }
    return data.voices.map((v) => ({
      id: v.voice_id,
      label: v.name
        ? `${v.name}${v.gender ? ` (${v.gender === "female" ? "F" : "M"})` : ""}`
        : v.voice_id,
      gender: v.gender ?? "neutral",
    }));
  } catch {
    return [...GROK_TTS_VOICES_FALLBACK];
  }
}

export class GrokTTS implements TTSProvider {
  private apiKey: string;
  private voice: string;
  private speed: number;
  private language: string;

  constructor(
    _model?: string,
    voice: string = DEFAULT_VOICE,
    apiKey?: string,
    speed?: number,
    language: string = "auto",
  ) {
    const key = apiKey ?? process.env["XAI_API_KEY"];
    if (!key) throw new Error("XAI_API_KEY environment variable is required for Grok TTS");
    this.apiKey = key;
    this.voice = voice || DEFAULT_VOICE;
    this.speed = speed != null ? Math.min(1.5, Math.max(0.7, speed)) : 1.0;
    this.language = language || "auto";
  }

  async generate(text: string): Promise<TTSResult> {
    if (text.length > MAX_INPUT_CHARS) {
      throw new Error(
        `Grok TTS limit exceeded: script is ${text.length} chars, max ${MAX_INPUT_CHARS}. Shorten the script.`,
      );
    }

    const body: Record<string, unknown> = {
      text,
      voice_id: this.voice,
      // Production topics are mostly Spanish; `auto` detects BCP-47 language.
      // Hardcoding `en` mispronounces Spanish narration.
      language: this.language,
      text_normalization: true,
      with_timestamps: true,
      // WAV so WhisperAligner can still run if native timestamps are missing.
      output_format: { codec: "wav", sample_rate: 16000 },
    };
    if (this.speed !== 1.0) body["speed"] = this.speed;

    let response: Response;
    try {
      response = await fetch(`${XAI_BASE_URL}/tts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("TimeoutError") || msg.includes("aborted") || msg.includes("timeout")) {
        throw new Error(`Grok TTS timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
      }
      throw new Error(`Grok TTS request failed: ${msg}`);
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Grok TTS authentication failed (${response.status}): ${errBody}. Check your XAI_API_KEY.`,
        );
      }
      if (response.status === 429) {
        throw new Error(`Grok TTS rate limited: ${errBody}`);
      }
      throw new Error(`Grok TTS API error (${response.status}): ${errBody}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as TimedTtsPayload;
      if (!payload.audio) {
        throw new Error("Grok TTS returned JSON without audio");
      }
      const audio = Buffer.from(payload.audio, "base64");
      if (audio.byteLength === 0) {
        throw new Error("Grok TTS returned empty audio");
      }
      const chars = payload.audio_timestamps?.graph_chars ?? [];
      const times = payload.audio_timestamps?.graph_times ?? [];
      const words = chars.length > 0 ? charsToWords(chars, times) : [];
      return { audio, words };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Grok TTS returned empty audio");
    }
    return { audio: Buffer.from(arrayBuffer), words: [] };
  }
}
