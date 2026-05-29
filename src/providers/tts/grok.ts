import type { TTSProvider, TTSResult } from "../../schema/providers.js";

const XAI_BASE_URL = "https://api.x.ai/v1";

// Available voices for xAI TTS
// Ref: https://docs.x.ai/developers/model-capabilities/audio/tts
const DEFAULT_MODEL = "grok-tts-mini";
const DEFAULT_VOICE = "bria"; // female, natural

export class GrokTTS implements TTSProvider {
  private apiKey: string;
  private model: string;
  private voice: string;

  constructor(model: string = DEFAULT_MODEL, voice: string = DEFAULT_VOICE, apiKey?: string) {
    const key = apiKey ?? process.env["XAI_API_KEY"];
    if (!key) throw new Error("XAI_API_KEY environment variable is required for Grok TTS");
    this.apiKey = key;
    this.model = model;
    this.voice = voice;
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
