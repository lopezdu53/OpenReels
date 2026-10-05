import type { ImageProvider } from "../../schema/providers.js";
import { DEFAULT_SHARPII_IMAGE_MODEL, resolveSharpiiImageModel } from "../sharpii/catalog.js";
import { downloadUrl, sharpiiGenerate, toDataUri } from "../sharpii/client.js";

export class SharpiiImage implements ImageProvider {
  private apiKey: string;
  private modelId: string;

  constructor(modelId: string = DEFAULT_SHARPII_IMAGE_MODEL, apiKey?: string) {
    const key = apiKey ?? process.env["SHARPII_API_KEY"];
    if (!key) throw new Error("SHARPII_API_KEY environment variable is required");
    this.apiKey = key;
    this.modelId = resolveSharpiiImageModel(modelId).id;
  }

  async generate(
    prompt: string,
    style?: string,
    referenceImage?: Buffer,
    aspectRatio?: string,
    referenceImageUrl?: string,
  ): Promise<Buffer> {
    const spec = resolveSharpiiImageModel(this.modelId);
    const ratio = aspectRatio === "16:9" || aspectRatio === "1:1" || aspectRatio === "9:16" ? aspectRatio : "9:16";
    const fullPrompt = style ? `${prompt}. Style: ${style}. No text, no watermarks.` : `${prompt}. No text, no watermarks.`;

    const refs: string[] = [];
    if (spec.refs) {
      if (referenceImageUrl?.startsWith("http")) refs.push(referenceImageUrl);
      else if (referenceImage && referenceImage.length > 80) refs.push(toDataUri(referenceImage));
    }

    const outputs = await sharpiiGenerate(this.apiKey, "/images/generate", {
      model: spec.id,
      prompt: fullPrompt,
      aspect_ratio: ratio,
      ...(refs.length ? { reference_images: refs.slice(0, 5) } : {}),
    });
    const url = outputs.find((o) => o.url)?.url;
    if (!url) throw new Error("Sharpii image returned no URL");
    return downloadUrl(url);
  }
}
