import type { TTSProvider, TTSResult } from "../../schema/providers.js";
import { DEFAULT_ATLAS_TTS_VOICE, resolveAtlasTtsModel } from "../atlas/catalog.js";
import { downloadUrl, generateAudio, requireAtlasApiKey } from "../atlas/client.js";

const MAX_INPUT_CHARS = 15_000;

export class AtlasTTS implements TTSProvider {
  private apiKey: string;
  private voice: string;
  private speed: number;
  private modelId: string;
  private voiceField: "voice_id" | "voice";

  constructor(voice: string = DEFAULT_ATLAS_TTS_VOICE, apiKey?: string, speed?: number, model?: string) {
    this.apiKey = requireAtlasApiKey("TTS", apiKey);
    const spec = resolveAtlasTtsModel(model);
    this.modelId = spec.id;
    this.voiceField = spec.voiceField;
    this.voice = voice || spec.voices[0]?.id || DEFAULT_ATLAS_TTS_VOICE;
    this.speed = speed != null ? Math.min(1.5, Math.max(0.7, speed)) : 1.0;
  }

  async generate(text: string): Promise<TTSResult> {
    if (text.length > MAX_INPUT_CHARS) {
      throw new Error(
        `Atlas TTS limit exceeded: script is ${text.length} chars, max ${MAX_INPUT_CHARS}. Shorten the script.`,
      );
    }

    const extra: Record<string, unknown> = { text };
    extra[this.voiceField] = this.voice;
    if (this.voiceField === "voice_id") {
      extra["language"] = "auto";
      extra["codec"] = "wav";
      extra["sample_rate"] = 16000;
      extra["text_normalization"] = true;
      if (this.speed !== 1.0) extra["speed"] = this.speed;
    }

    const url = await generateAudio(this.apiKey, this.modelId, extra);
    const audio = await downloadUrl(url);
    if (audio.byteLength === 0) throw new Error("Atlas TTS returned empty audio");
    return { audio, words: [] };
  }
}
