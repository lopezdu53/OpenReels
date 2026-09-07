import type { ImageProvider } from "../../schema/providers.js";
import { isTransientVisualError } from "../../pipeline/hold-frame.js";
import { DEFAULT_ATLAS_IMAGE_MODEL, resolveAtlasImageModel } from "../atlas/catalog.js";
import { downloadUrl, generateImage, requireAtlasApiKey, toDataUri } from "../atlas/client.js";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000;

export class AtlasImage implements ImageProvider {
  private apiKey: string;
  private modelId: string;

  constructor(modelId: string = DEFAULT_ATLAS_IMAGE_MODEL, apiKey?: string) {
    this.apiKey = requireAtlasApiKey("image", apiKey);
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

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const url = await generateImage(this.apiKey, model, fullPrompt, extra);
        const buf = await downloadUrl(url);
        if (buf.length < 1000) throw new Error(`Atlas image too small (${buf.length} bytes)`);
        return buf;
      } catch (err) {
        lastError = err;
        if (!isTransientVisualError(err) || attempt === MAX_RETRIES - 1) break;
        const delayMs = BASE_DELAY_MS * 2 ** attempt;
        console.warn(`[image/atlas] Attempt ${attempt + 1} failed (${err}), retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastError;
  }
}
