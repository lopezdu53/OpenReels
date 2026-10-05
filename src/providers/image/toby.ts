import type { ImageProvider } from "../../schema/providers.js";
import { resolveTobyImageModel } from "../toby/catalog.js";
import { generateTobyImage } from "../toby/generate.js";

export class TobyImage implements ImageProvider {
  private modelId: string;

  constructor(modelId?: string) {
    this.modelId = resolveTobyImageModel(modelId);
  }

  async generate(
    prompt: string,
    style?: string,
    referenceImage?: Buffer,
    aspectRatio?: string,
  ): Promise<Buffer> {
    const aspect = aspectRatio === "9:16" || aspectRatio === "1:1" ? aspectRatio : "16:9";
    const full = style ? `${prompt}. Style: ${style}` : prompt;
    return generateTobyImage({
      prompt: full,
      aspect,
      model: this.modelId,
      referencePng: referenceImage,
    });
  }
}
