import { createFalClient, type FalClient } from "@fal-ai/client";
import type { ImageProvider } from "../../schema/providers.js";

const DEFAULT_MODEL = "fal-ai/flux/dev";

interface FalImageOutput {
  images: Array<{ url: string; content_type?: string }>;
}

export class FalImage implements ImageProvider {
  private client: FalClient;
  private model: string;

  constructor(model: string = DEFAULT_MODEL, apiKey?: string) {
    const key = apiKey ?? process.env["FAL_API_KEY"];
    if (!key) throw new Error("FAL_API_KEY environment variable is required for fal.ai image generation");
    this.client = createFalClient({ credentials: key });
    this.model = model;
  }

  async generate(prompt: string, style?: string, _referenceImage?: Buffer, aspectRatio?: string): Promise<Buffer> {
    const isLandscape = aspectRatio === "16:9";
    const imageSize = isLandscape
      ? { width: 1216, height: 832 }
      : { width: 832, height: 1216 };

    const orientationHint = isLandscape
      ? "WIDE HORIZONTAL LANDSCAPE image ONLY. 16:9 widescreen aspect ratio. CRITICAL: Do NOT generate portrait or vertical orientation."
      : "Vertical 9:16 portrait image.";

    const fullPrompt = isLandscape
      ? `${orientationHint} ${prompt}.${style ? ` Style: ${style}.` : ""} No text, no watermarks.`
      : style
        ? `${prompt}. Style: ${style}. ${orientationHint} No text, no watermarks.`
        : `${prompt}. ${orientationHint} No text, no watermarks.`;

    const result = await this.client.subscribe(this.model, {
      input: {
        prompt: fullPrompt,
        image_size: imageSize,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        num_images: 1,
        enable_safety_checker: false,
      },
    });

    const output = result.data as FalImageOutput;
    const imageUrl = output.images?.[0]?.url;
    if (!imageUrl) throw new Error(`fal.ai image: no image URL in response`);

    console.log(`[image/fal] Downloading result from ${imageUrl.slice(0, 60)}...`);
    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`fal.ai image download failed: ${res.status}`);
    return Buffer.from(new Uint8Array(await res.arrayBuffer()));
  }
}
