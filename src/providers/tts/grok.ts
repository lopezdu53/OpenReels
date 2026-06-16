import type { TTSProvider, TTSResult } from "../../schema/providers.js";

const XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_VOICE = "bria";

// Fallback built-in voices (populated from GET /v1/tts/voices at runtime)
export const GROK_TTS_VOICES_FALLBACK = [
  { id: "bria",    label: "Bria — Natural (F)",    gender: "female" },
  { id: "celeste", label: "Celeste — Clara (F)",    gender: "female" },
  { id: "clio",    label: "Clio — Profesional (F)", gender: "female" },
  { id: "dan",     label: "Dan — Natural (M)",       gender: "male"   },
  { id: "archer",  label: "Archer — Profundo (M)",   gender: "male"   },
  { id: "vale",    label: "Vale — Suave (M)",        gender: "male"   },
] as const;

export const GROK_TTS_VOICES = GROK_TTS_VOICES_FALLBACK;

export type GrokTTSVoice = typeof GROK_TTS_VOICES[number]["id"];

/** Fetch available built-in voices from xAI API (for dynamic server-side loading) */
export async function fetchGrokTtsVoices(apiKey: string): Promise<Array<{ id: string; label: string; gender: string }>> {
  try {
    const res = await fetch(`${XAI_BASE_URL}/tts/voices`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [...GROK_TTS_VOICES_FALLBACK];
    const data = (await res.json()) as { voices?: Array<{ voice_id: string; name?: string; gender?: string }> };
    if (!Array.isArray(data.voices) || data.voices.length === 0) return [...GROK_TTS_VOICES_FALLBACK];
    return data.voices.map((v) => ({
      id: v.voice_id,
      label: v.name ? `${v.name}${v.gender ? ` (${v.gender === "female" ? "F" : "M"})` : ""}` : v.voice_id,
      gender: v.gender ?? "neutral",
    }));
  } catch {
    return [...GROK_TTS_VOICES_FALLBACK];
  }
}

export class GrokTTS implements TTSProvider {
  private apiKey: string;
  private voice: string;

  constructor(_model?: string, voice: string = DEFAULT_VOICE, apiKey?: string, _speed?: number) {
    const key = apiKey ?? process.env["XAI_API_KEY"];
    if (!key) throw new Error("XAI_API_KEY environment variable is required for Grok TTS");
    this.apiKey = key;
    this.voice = voice || DEFAULT_VOICE;
  }

  async generate(text: string): Promise<TTSResult> {
    // xAI native TTS endpoint: POST /v1/tts
    const response = await fetch(`${XAI_BASE_URL}/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voice_id: this.voice,
        language: "en",
      }),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      throw new Error(`Grok TTS API error (${response.status}): ${errBody}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      throw new Error("Grok TTS returned empty audio");
    }

    return { audio: Buffer.from(arrayBuffer), words: [] };
  }
}
