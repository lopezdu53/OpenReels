import type { VideoProvider, VideoResult } from "../../schema/providers.js";
import { cloudflareApiToken } from "../cloudflare/client.js";

/**
 * Workers AI (oct 2026) has LLM, TTS and T2I — not T2V/I2V.
 * Keep the provider so Lab/Short/Film can select it and show a clear error.
 */
export class CloudflareVideo implements VideoProvider {
  readonly supportedDurations = [] as number[];

  constructor(apiKey?: string) {
    if (!cloudflareApiToken(apiKey)) {
      throw new Error("CLOUDFLARE_API_TOKEN is required for Cloudflare video");
    }
  }

  async generate(_opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    negativePrompt?: string;
  }): Promise<VideoResult> {
    throw new Error(
      "Cloudflare Workers AI no tiene T2V ni I2V en el catálogo (oct 2026). Usa Flux T2I + Atlas/gflow/fal/Grok para el video.",
    );
  }
}
