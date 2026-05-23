import OpenAI from "openai";
import type { ImageProvider } from "../../schema/providers.js";

// Alibaba Cloud MaaS OpenAI-compatible endpoint
const ALICLOUD_BASE_URL =
  process.env["ALICLOUD_BASE_URL"] ??
  "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";

// Available image models on this plan:
//   Wanxiang: wan2.7-image (default) | wan2.7-image-pro
//   Note: qwen-image-2.0/pro are vision (understanding) models, not generation
const DEFAULT_MODEL = "wan2.7-image";

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

function isRetryable(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("rate_limit") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET")
  );
}

export class AliCloudImage implements ImageProvider {
  private client: OpenAI;
  private model: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey ?? process.env["ALICLOUD_API_KEY"];
    if (!key) throw new Error("ALICLOUD_API_KEY environment variable is required");
    this.client = new OpenAI({ apiKey: key, baseURL: ALICLOUD_BASE_URL });
    this.model = model ?? process.env["ALICLOUD_IMAGE_MODEL"] ?? DEFAULT_MODEL;
  }

  async generate(prompt: string, style?: string): Promise<Buffer> {
    const fullPrompt = style
      ? `${prompt}. Style: ${style}. Vertical portrait orientation, 9:16 aspect ratio. No text, no watermarks.`
      : `${prompt}. Vertical portrait orientation, 9:16 aspect ratio. No text, no watermarks.`;

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.images.generate({
          model: this.model,
          prompt: fullPrompt,
          n: 1,
          size: "768x1280",
        } as Parameters<typeof this.client.images.generate>[0]);

        // Handle both b64_json and url response formats
        const item = response.data?.[0];
        if (!item) throw new Error("AliCloud returned no image data");

        if (item.b64_json) {
          return Buffer.from(item.b64_json, "base64");
        }
        if (item.url) {
          const res = await fetch(item.url);
          if (!res.ok) throw new Error(`AliCloud image download failed: ${res.status}`);
          return Buffer.from(await res.arrayBuffer());
        }

        throw new Error("AliCloud returned no image URL or base64 data");
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === MAX_RETRIES - 1) break;
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[image/alicloud] Attempt ${attempt + 1} failed (${err}), retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastError;
  }
}
