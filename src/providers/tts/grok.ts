import type { TTSProvider, TTSResult } from "../../schema/providers.js";

const XAI_BASE_URL = "https://api.x.ai/v1";

// Available voices for xAI TTS
// Ref: https://docs.x.ai/developers/model-capabilities/audio/tts
const DEFAULT_MODEL = "grok-tts-mini";
const DEFAULT_VOICE = "bria"; // female, natural

export const GROK_TTS_VOICES = [
  { id: "bria",    label: "Bria — Natural (F)",      gender: "female" },
  { id: "celeste", label: "Celeste — Clara (F)",      gender: "female" },
  { id: "clio",    label: "Clio — Profesional (F)",   gender: "female" },
  { id: "dan",     label: "Dan — Natural (M)",         gender: "male"   },
  { id: "archer",  label: "Archer — Profundo (M)",     gender: "male"   },
  { id: "vale",    label: "Vale — Suave (M)",          gender: "male"   },
] as const;

export const GROK_TTS_MODELS = [
  { id: "grok-tts-mini", label: "Grok TTS Mini (rápido)" },
  { id: "grok-tts",      label: "Grok TTS (alta calidad)" },
] as const;

export type GrokTTSVoice = typeof GROK_TTS_VOICES[number]["id"];

export class GrokTTS implements TTSProvider {
  private apiKey: string;
  private model: string;
  private voice: string;
  private speed: number;

  constructor(model: string = DEFAULT_MODEL, voice: string = DEFAULT_VOICE, apiKey?: string, speed: number = 1.0) {
    const key = apiKey ?? process.env["XAI_API_KEY"];
    if (!key) throw new Error("XAI_API_KEY environment variable is required for Grok TTS");
    this.apiKey = key;
    this.model = model;
    this.voice = voice;
    this.speed = Math.min(Math.max(speed, 0.5), 2.0);
  }

  async generate(text: string): Promise<TTSResult> {
    const response = await fetch(`${XAI_BASE_URL}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        input: text,
        voice: this.voice,
        speed: this.speed,
        response_format: "mp3",
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
