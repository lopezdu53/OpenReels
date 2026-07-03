import type { TTSProvider, TTSResult } from "../../schema/providers.js";

const XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_VOICE = "eve";

export const GROK_TTS_VOICES_FALLBACK = [
  { id: "eve", label: "Eve — Energetic, upbeat (F)",       gender: "female" },
  { id: "ara", label: "Ara — Warm, friendly (F)",           gender: "female" },
  { id: "rex", label: "Rex — Confident, clear (M)",         gender: "male"   },
  { id: "sal", label: "Sal — Smooth, balanced (M)",         gender: "male"   },
  { id: "leo", label: "Leo — Authoritative, strong (M)",    gender: "male"   },
] as const;

export const GROK_TTS_VOICES = GROK_TTS_VOICES_FALLBACK;

// No model selection in xAI TTS API — kept for API compatibility
export const GROK_TTS_MODELS: { id: string; label: string }[] = [];

export type GrokTTSVoice = typeof GROK_TTS_VOICES[number]["id"];

/** Fetch available voices from xAI API (includes custom voices) */
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
  private speed: number;

  constructor(_model?: string, voice: string = DEFAULT_VOICE, apiKey?: string, speed?: number) {
    const key = apiKey ?? process.env["XAI_API_KEY"];
    if (!key) throw new Error("XAI_API_KEY environment variable is required for Grok TTS");
    this.apiKey = key;
    this.voice = voice || DEFAULT_VOICE;
    // Clamp speed to valid range 0.7–1.5
    this.speed = speed != null ? Math.min(1.5, Math.max(0.7, speed)) : 1.0;
  }

  async generate(text: string): Promise<TTSResult> {
    const body: Record<string, unknown> = {
      text,
      voice_id: this.voice,
      language: "en",
      // WAV output so WhisperAligner can parse it (wavefile library requires WAV)
      output_format: { codec: "wav", sample_rate: 16000 },
    };
    if (this.speed !== 1.0) body["speed"] = this.speed;

    const response = await fetch(`${XAI_BASE_URL}/tts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
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
