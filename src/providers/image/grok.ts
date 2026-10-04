import type { ImageProvider } from "../../schema/providers.js";

const XAI_BASE_URL = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-imagine-image-2.0";
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;
const REQUEST_TIMEOUT_MS = 120_000;

function isRetryable(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("rate_limit") ||
    msg.includes("overloaded") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET") ||
    msg.includes("timed out")
  );
}

interface ImageGenResponse {
  data?: Array<{ url?: string; b64_json?: string }>;
  error?: { message?: string };
}

async function downloadImage(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Grok image download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) throw new Error(`Grok image too small (${buf.length} bytes)`);
  return buf;
}

export class GrokImage implements ImageProvider {
  private apiKey: string;
  private model: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey ?? process.env["XAI_API_KEY"];
    if (!key) throw new Error("XAI_API_KEY environment variable is required for Grok image");
    this.apiKey = key;
    this.model = model || DEFAULT_MODEL;
  }

  async generate(
    prompt: string,
    style?: string,
    referenceImage?: Buffer,
    aspectRatio?: string,
  ): Promise<Buffer> {
    const isLandscape = aspectRatio === "16:9";
    const orientationDesc = isLandscape
      ? "Horizontal landscape orientation, 16:9 aspect ratio"
      : "Vertical portrait orientation, 9:16 aspect ratio";
    const fullPrompt = style
      ? `${prompt}. Style: ${style}. ${orientationDesc}. No text, no watermarks.`
      : `${prompt}. ${orientationDesc}. No text, no watermarks.`;

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.generateOnce(fullPrompt, isLandscape, referenceImage);
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === MAX_RETRIES - 1) break;
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[image/grok] Attempt ${attempt + 1} failed (${err}), retrying in ${delayMs / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastError;
  }

  private async generateOnce(
    prompt: string,
    isLandscape: boolean,
    referenceImage?: Buffer,
  ): Promise<Buffer> {
    const endpoint = referenceImage ? "/images/edits" : "/images/generations";
    const body: Record<string, unknown> = {
      model: this.model,
      prompt,
      n: 1,
      aspect_ratio: isLandscape ? "16:9" : "9:16",
    };
    if (referenceImage) {
      body["image"] = {
        url: `data:image/png;base64,${referenceImage.toString("base64")}`,
        type: "image_url",
      };
    }

    const response = await fetch(`${XAI_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Grok image authentication failed (${response.status}): ${errBody}. Check your XAI_API_KEY.`,
        );
      }
      throw new Error(`Grok image API error (${response.status}): ${errBody}`);
    }

    const payload = (await response.json()) as ImageGenResponse;
    const item = payload.data?.[0];
    if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
    if (item?.url) return downloadImage(item.url);
    throw new Error(
      `Grok image returned no image data: ${payload.error?.message ?? JSON.stringify(payload).slice(0, 200)}`,
    );
  }
}
