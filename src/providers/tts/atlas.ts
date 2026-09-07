import type { TTSProvider, TTSResult } from "../../schema/providers.js";
import { DEFAULT_ATLAS_TTS_VOICE } from "../atlas/catalog.js";
import { downloadUrl, generateAudio } from "../atlas/client.js";

const MAX_INPUT_CHARS = 15_000;
const DEFAULT_MODEL = "xai/tts-v1";

export class AtlasTTS implements TTSProvider {
  private apiKey: string;
  private voice: string;
  private speed: number;

  constructor(voice: string = DEFAULT_ATLAS_TTS_VOICE, apiKey?: string, speed?: number) {
    const key = apiKey ?? process.env["ATLASCLOUD_API_KEY"];
    if (!key) throw new Error("ATLASCLOUD_API_KEY environment variable is required for Atlas TTS");
    this.apiKey = key;
    this.voice = voice || DEFAULT_ATLAS_TTS_VOICE;
    this.speed = speed != null ? Math.min(1.5, Math.max(0.7, speed)) : 1.0;
  }

  async generate(text: string): Promise<TTSResult> {
    if (text.length > MAX_INPUT_CHARS) {
      throw new Error(
        `Atlas TTS limit exceeded: script is ${text.length} chars, max ${MAX_INPUT_CHARS}. Shorten the script.`,
      );
    }

    const extra: Record<string, unknown> = {
      text,
      language: "auto",
      voice_id: this.voice,
      codec: "wav",
      sample_rate: 16000,
      text_normalization: true,
    };
    if (this.speed !== 1.0) extra["speed"] = this.speed;

    const url = await generateAudio(this.apiKey, DEFAULT_MODEL, extra);
    const audio = await downloadUrl(url);
    if (audio.byteLength === 0) throw new Error("Atlas TTS returned empty audio");
    return { audio, words: [] };
  }
}
