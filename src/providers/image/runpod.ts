import type { ImageProvider } from "../../schema/providers.js";
import {
  canonicalizeRunPodImageModelId,
  DEFAULT_RUNPOD_IMAGE_MODEL,
  getRunPodImageModel,
  isRunPodPublicModelId,
  type RunPodImageModel,
} from "../runpod/catalog.js";
import { extractMediaBuffer, isRunPodRetryable, runPodJob } from "../runpod/client.js";

const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 180_000;

const DIMENSIONS = {
  portrait: { width: 768, height: 1344 },
  landscape: { width: 1344, height: 768 },
  square: { width: 1024, height: 1024 },
} as const;

export interface RunPodImageConfig {
  model?: string;
  endpointId?: string;
  apiKey?: string;
  steps?: number;
  guidance?: number;
}

function resolveEndpoint(config: RunPodImageConfig): { endpointId: string; modelId: string } {
  const modelId = canonicalizeRunPodImageModelId(config.model ?? DEFAULT_RUNPOD_IMAGE_MODEL);
  if (modelId === "custom") {
    const ep = config.endpointId ?? process.env["RUNPOD_IMAGE_ENDPOINT_ID"];
    if (!ep) throw new Error("RUNPOD_IMAGE_ENDPOINT_ID is required for a custom RunPod image endpoint");
    return { endpointId: ep, modelId };
  }
  if (config.endpointId && !config.model) {
    // Legacy EasyPanel: only an endpoint UUID is configured.
    return { endpointId: config.endpointId, modelId: "custom" };
  }
  return { endpointId: modelId, modelId };
}

export class RunPodImage implements ImageProvider {
  private apiKey: string;
  private endpointId: string;
  private modelId: string;
  private steps?: number;
  private guidance?: number;

  constructor(modelOrConfig?: string | RunPodImageConfig, apiKey?: string) {
    const config: RunPodImageConfig =
      typeof modelOrConfig === "object" && modelOrConfig !== null
        ? modelOrConfig
        : {
            model: modelOrConfig && isRunPodPublicModelId(modelOrConfig) ? modelOrConfig : undefined,
            endpointId:
              modelOrConfig && !isRunPodPublicModelId(modelOrConfig) ? modelOrConfig : undefined,
            apiKey,
          };

    const key = config.apiKey ?? apiKey ?? process.env["RUNPOD_API_KEY"];
    if (!key) throw new Error("RUNPOD_API_KEY environment variable is required");
    if (!config.endpointId && !config.model) {
      config.endpointId = process.env["RUNPOD_IMAGE_ENDPOINT_ID"];
      config.model = process.env["RUNPOD_IMAGE_MODEL"] ?? (config.endpointId ? "custom" : DEFAULT_RUNPOD_IMAGE_MODEL);
    }

    const resolved = resolveEndpoint(config);
    this.apiKey = key;
    this.endpointId = resolved.endpointId;
    this.modelId = resolved.modelId;
    this.steps = config.steps;
    this.guidance = config.guidance;
  }

  async generate(prompt: string, style?: string, _referenceImage?: Buffer, aspectRatio?: string): Promise<Buffer> {
    const spec = getRunPodImageModel(this.modelId);
    const dims = dimensionsFor(spec, aspectRatio);

    const orientationHint =
      aspectRatio === "16:9"
        ? "WIDE HORIZONTAL LANDSCAPE image ONLY. 16:9 widescreen. Do NOT generate portrait."
        : aspectRatio === "1:1"
          ? "Square 1:1 image."
          : "Vertical 9:16 portrait image.";

    const fullPrompt = style
      ? `${prompt}. Style: ${style}. ${orientationHint} No text, no watermarks.`
      : `${prompt}. ${orientationHint} No text, no watermarks.`;

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.runJob(fullPrompt, dims.width, dims.height);
      } catch (err) {
        lastError = err;
        if (!isRunPodRetryable(err) || attempt === 2) break;
        const delay = 3000 * Math.pow(2, attempt);
        console.warn(`[image/runpod] Attempt ${attempt + 1} failed (${err}), retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  private async runJob(prompt: string, width: number, height: number): Promise<Buffer> {
    const spec = getRunPodImageModel(this.modelId);
    const steps = this.steps ?? spec.defaultSteps;
    const guidance = this.guidance ?? spec.defaultGuidance;

    const input: Record<string, unknown> = { prompt };

    if (spec.sizeMode === "aspect") {
      input["aspect_ratio"] = aspectRatioFor(width, height);
    } else if (spec.sizeMode === "preset") {
      input["size"] = `${width}*${height}`;
    } else {
      input["width"] = width;
      input["height"] = height;
    }
    if (steps != null) input["num_inference_steps"] = steps;
    if (guidance != null) {
      input["guidance"] = guidance;
      input["guidance_scale"] = guidance;
    }
    input["num_images"] = 1;
    input["image_format"] = "png";
    input["output_format"] = "png";

    const output = await runPodJob({
      endpointId: this.endpointId,
      apiKey: this.apiKey,
      input,
      pollMs: POLL_INTERVAL_MS,
      timeoutMs: TIMEOUT_MS,
      logPrefix: "image/runpod",
    });

    const buffer = await extractMediaBuffer(output, "image");
    if (!buffer || buffer.length < 1000) {
      throw new Error(`RunPod image: completed but no image in output: ${JSON.stringify(output)}`);
    }
    return buffer;
  }
}

function dimensionsFor(spec: RunPodImageModel, aspectRatio?: string): { width: number; height: number } {
  if (spec.sizeMode === "preset" || spec.sizeMode === "aspect") {
    if (aspectRatio === "16:9") return { width: 1280, height: 720 };
    if (aspectRatio === "1:1") return { width: 1024, height: 1024 };
    return { width: 720, height: 1280 };
  }
  if (aspectRatio === "16:9") return DIMENSIONS.landscape;
  if (aspectRatio === "1:1") return DIMENSIONS.square;
  return DIMENSIONS.portrait;
}

function aspectRatioFor(width: number, height: number): string {
  if (width === height) return "1:1";
  return width > height ? "16:9" : "9:16";
}
