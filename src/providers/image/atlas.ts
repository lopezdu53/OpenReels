import type { ImageProvider } from "../../schema/providers.js";
import { DEFAULT_ATLAS_IMAGE_MODEL, resolveAtlasImageModel } from "../atlas/catalog.js";
import { downloadUrl, generateImage, toDataUri } from "../atlas/client.js";

export class AtlasImage implements ImageProvider {
  private apiKey: string;
  private modelId: string;

  constructor(modelId: string = DEFAULT_ATLAS_IMAGE_MODEL, apiKey?: string) {
    const key = apiKey ?? process.env["ATLASCLOUD_API_KEY"];
    if (!key) throw new Error("ATLASCLOUD_API_KEY environment variable is required for Atlas image");
    this.apiKey = key;
    this.modelId = resolveAtlasImageModel(modelId).id;
  }

  async generate(
    prompt: string,
    style?: string,
    referenceImage?: Buffer,
    aspectRatio?: string,
  ): Promise<Buffer> {
    const spec = resolveAtlasImageModel(this.modelId);
    const ratio =
      aspectRatio === "16:9" || aspectRatio === "1:1" || aspectRatio === "9:16" ? aspectRatio : "9:16";
    const fullPrompt = style
      ? `${prompt}. Style: ${style}. No text, no watermarks.`
      : `${prompt}. No text, no watermarks.`;

    const useEdit = Boolean(spec.refs && spec.editId && referenceImage && referenceImage.length > 80);
    const model = useEdit ? spec.editId! : spec.id;
    const extra: Record<string, unknown> = {};
    if (model.includes("nano-banana") || model.includes("qwen-image")) {
      extra["aspect_ratio"] = ratio;
    }
    if (useEdit) {
      extra["images"] = [toDataUri(referenceImage!)];
    }

    const url = await generateImage(this.apiKey, model, fullPrompt, extra);
    const buf = await downloadUrl(url);
    if (buf.length < 1000) throw new Error(`Atlas image too small (${buf.length} bytes)`);
    return buf;
  }
}
