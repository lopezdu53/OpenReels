import type { ImageProvider } from "../../schema/providers.js";
import { DEFAULT_CLOUDFLARE_IMAGE, resolveCloudflareImage } from "../cloudflare/catalog.js";
import { cloudflareApiToken, cloudflareRun } from "../cloudflare/client.js";

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
    const body: Record<string, unknown> = {
      prompt: full.slice(0, 2000),
      steps: this.model.includes("schnell") ? 4 : 8,
    };
    if (referenceImage && referenceImage.length > 80 && /flux-2|klein/i.test(this.model)) {
      body.image = referenceImage.toString("base64");
    }
    const { json } = await cloudflareRun(this.model, body, { token: this.token, timeoutMs: 180_000 });
    const image = extractImage(json);
    if (!image || image.length < 800) throw new Error("Cloudflare image vacía");
    return image;
  }
}

function extractImage(json: unknown): Buffer | null {
  if (!json || typeof json !== "object") return null;
  const rec = json as Record<string, unknown>;
  const b64 = rec.image ?? rec.image_b64 ?? (rec.result as Record<string, unknown> | undefined)?.image;
  if (typeof b64 === "string" && b64.length > 80) {
    const raw = b64.includes(",") ? b64.split(",")[1]! : b64;
    return Buffer.from(raw, "base64");
  }
  return null;
}
