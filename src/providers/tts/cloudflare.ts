import type { TTSProvider, TTSResult } from "../../schema/providers.js";
import {
  DEFAULT_CLOUDFLARE_TTS,
  DEFAULT_CLOUDFLARE_TTS_SPEAKER,
  resolveCloudflareTts,
} from "../cloudflare/catalog.js";
import { cloudflareApiToken, cloudflareRun } from "../cloudflare/client.js";

export class CloudflareTTS implements TTSProvider {
  private model: string;
  private speaker: string;
  private token?: string;

  constructor(model?: string, speaker?: string, apiKey?: string) {
    if (!cloudflareApiToken(apiKey)) {
      throw new Error("CLOUDFLARE_API_TOKEN is required for Cloudflare TTS");
    }
    this.token = apiKey;
    this.model = resolveCloudflareTts(model);
    this.speaker = speaker?.trim() || DEFAULT_CLOUDFLARE_TTS_SPEAKER;
  }

  async generate(text: string): Promise<TTSResult> {
    const body: Record<string, unknown> = {
      text: text.slice(0, 4000),
      speaker: this.speaker,
      encoding: "linear16",
      container: "wav",
    };
    const { json, buffer } = await cloudflareRun(this.model, body, {
      token: this.token,
      timeoutMs: 90_000,
    });
    let audio = buffer;
    if (!audio && json && typeof json === "object") {
      const rec = json as Record<string, unknown>;
      const b64 = rec.audio ?? rec.audio_b64;
      if (typeof b64 === "string") audio = Buffer.from(b64, "base64");
    }
    if (!audio || audio.length < 200) throw new Error("Cloudflare TTS no devolvió audio");
    return { audio, words: [] };
  }
}
