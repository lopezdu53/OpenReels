import type { ImageProvider } from "../../schema/providers.js";
import { resolveCloudflareImage } from "../cloudflare/catalog.js";
import { cloudflareApiToken, cloudflareRun } from "../cloudflare/client.js";

export function cloudflareImageSize(aspectRatio?: string): { width: number; height: number } {
  if (aspectRatio === "16:9") return { width: 1344, height: 768 };
  if (aspectRatio === "1:1") return { width: 1024, height: 1024 };
  return { width: 768, height: 1344 };
}

function needsMultipart(model: string): boolean {
  return /flux-2|klein|phoenix|lucid/i.test(model);
}

export class CloudflareImage implements ImageProvider {
  private model: string;
  private token?: string;

  constructor(model?: string, apiKey?: string) {
    if (!cloudflareApiToken(apiKey)) {
      throw new Error("CLOUDFLARE_API_TOKEN is required for Cloudflare image");
    }
    this.token = apiKey;
    this.model = resolveCloudflareImage(model);
  }

  async generate(
    prompt: string,
    style?: string,
    referenceImage?: Buffer,
    aspectRatio?: string,
  ): Promise<Buffer> {
    const orientation =
      aspectRatio === "16:9"
        ? "16:9 landscape"
        : aspectRatio === "1:1"
          ? "1:1 square"
          : "9:16 vertical portrait";
    const full = style
      ? `${prompt}. Style: ${style}. ${orientation}. No text, no watermarks.`
      : `${prompt}. ${orientation}. No text, no watermarks.`;
    const { width, height } = cloudflareImageSize(aspectRatio);
    const fields: Record<string, unknown> = {
      prompt: full.slice(0, 2000),
      width,
      height,
    };
    if (/schnell/i.test(this.model)) fields.steps = 4;
    if (referenceImage && referenceImage.length > 80) {
      fields.input_image_0 = referenceImage;
      fields.image = referenceImage;
    }

    const image = needsMultipart(this.model)
      ? await this.run(fields, true)
      : await this.runJsonOrMultipart(fields);
    if (!image || image.length < 800) throw new Error("Cloudflare image vacía");
    return image;
  }

  private async runJsonOrMultipart(fields: Record<string, unknown>): Promise<Buffer | null> {
    try {
      return await this.run(
        { prompt: fields.prompt, steps: fields.steps },
        false,
      );
    } catch (err) {
      if (!/multipart/i.test(String(err))) throw err;
      return this.run(fields, true);
    }
  }

  private async run(fields: Record<string, unknown>, multipart: boolean): Promise<Buffer | null> {
    const { json, buffer } = await cloudflareRun(this.model, fields, {
      token: this.token,
      timeoutMs: 180_000,
      multipart,
    });
    if (buffer && buffer.length > 800) return buffer;
    return extractImage(json);
  }
}

function extractImage(json: unknown): Buffer | null {
  if (!json || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  const nested = rec.result;
  const b64 =
    rec.image ??
    rec.image_b64 ??
    (nested && typeof nested === "object"
      ? (nested as Record<string, unknown>).image
      : undefined);
  if (typeof b64 === "string" && b64.length > 80) {
    const raw = b64.includes(",") ? b64.split(",")[1]! : b64;
    return Buffer.from(raw, "base64");
  }
  return null;
}
