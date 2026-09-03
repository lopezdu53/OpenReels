import type { ImageProvider } from "../../schema/providers.js";
import {
  canonicalizeRunPodImageModelId,
  DEFAULT_RUNPOD_IMAGE_MODEL,
  getRunPodImageModel,
  isRunPodPublicModelId,
  RUNPOD_IDENTITY_MODEL,
  RUNPOD_IDENTITY_STRENGTH,
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

  async generate(
    prompt: string,
    style?: string,
    _referenceImage?: Buffer,
    aspectRatio?: string,
    referenceImageUrl?: string,
  ): Promise<Buffer> {
    const refUrl = isHttpUrl(referenceImageUrl) ? referenceImageUrl.trim() : undefined;
    const job = resolveRunPodImageJob({
      primaryModelId: this.modelId,
      primaryEndpointId: this.endpointId,
      referenceImageUrl: refUrl,
      referenceImage: _referenceImage,
      aspectRatio,
    });

    const identityHint = refUrl
      ? "IDENTITY LOCK from the reference still: same individual, same crest/hair shape, same black patches and markings, same eye color and species. Change only camera angle, pose and location. "
      : "";

    const orientationHint =
      aspectRatio === "16:9"
        ? "WIDE HORIZONTAL LANDSCAPE image ONLY. 16:9 widescreen (width much greater than height, 1344x768). Fill the entire frame edge to edge. Do NOT generate portrait, square, black bars, or letterboxing."
        : aspectRatio === "1:1"
          ? "Square 1:1 image."
          : "Vertical 9:16 portrait image.";

    const fullPrompt = style
      ? `${identityHint}${prompt}. Style: ${style}. ${orientationHint} No text, no watermarks.`
      : `${identityHint}${prompt}. ${orientationHint} No text, no watermarks.`;

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.runJob(fullPrompt, job, aspectRatio, _referenceImage, refUrl);
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

  private async runJob(
    prompt: string,
    job: { spec: RunPodImageModel; endpointId: string },
    aspectRatio?: string,
    referenceImage?: Buffer,
    referenceImageUrl?: string,
  ): Promise<Buffer> {
    const dims = dimensionsFor(job.spec, aspectRatio);
    const steps = this.steps ?? job.spec.defaultSteps;
    const guidance = this.guidance ?? job.spec.defaultGuidance;
    const input = buildRunPodImageJobInput({
      spec: job.spec,
      prompt,
      width: dims.width,
      height: dims.height,
      aspectRatio,
      steps,
      guidance,
      referenceImage,
      referenceImageUrl,
    });

    const output = await runPodJob({
      endpointId: job.endpointId,
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

export function isHttpUrl(value?: string): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

/** Pick the endpoint that can honor a previous-scene still (crest, patches, face). */
export function resolveRunPodImageJob(opts: {
  primaryModelId: string;
  primaryEndpointId: string;
  referenceImageUrl?: string;
  referenceImage?: Buffer;
  aspectRatio?: string;
}): { spec: RunPodImageModel; endpointId: string } {
  const primary = getRunPodImageModel(opts.primaryModelId);
  const hasUrl = isHttpUrl(opts.referenceImageUrl);
  const hasBuf = !!(opts.referenceImage && opts.referenceImage.length > 100);
  if (hasUrl) {
    if (primary.supportsReference === "url") {
      return { spec: primary, endpointId: opts.primaryEndpointId };
    }
    const lock = getRunPodImageModel(RUNPOD_IDENTITY_MODEL);
    return { spec: lock, endpointId: lock.id };
  }
  if (hasBuf && primary.supportsReference === "data") {
    return { spec: primary, endpointId: opts.primaryEndpointId };
  }
  return { spec: primary, endpointId: opts.primaryEndpointId };
}

export function buildRunPodImageJobInput(opts: {
  spec: RunPodImageModel;
  prompt: string;
  width: number;
  height: number;
  aspectRatio?: string;
  steps?: number;
  guidance?: number;
  referenceImage?: Buffer;
  referenceImageUrl?: string;
}): Record<string, unknown> {
  const ratio = opts.aspectRatio ?? (opts.width > opts.height ? "16:9" : opts.width === opts.height ? "1:1" : "9:16");
  const refUrl = isHttpUrl(opts.referenceImageUrl) ? opts.referenceImageUrl.trim() : undefined;

  // z-image-turbo (and other URL img2img): lean payload, native 16:9 size.
  if (refUrl && opts.spec.supportsReference === "url") {
    const input: Record<string, unknown> = {
      prompt: opts.prompt,
      image: refUrl,
      strength: RUNPOD_IDENTITY_STRENGTH,
      output_format: "png",
    };
    if (opts.spec.sizeMode === "preset") input["size"] = `${opts.width}*${opts.height}`;
    else if (opts.spec.sizeMode === "aspect") input["aspect_ratio"] = ratio;
    else {
      input["width"] = opts.width;
      input["height"] = opts.height;
    }
    return input;
  }

  // p-image-t2i only accepts prompt + aspect_ratio. Extra keys 400.
  if (opts.spec.sizeMode === "aspect") {
    return { prompt: opts.prompt, aspect_ratio: ratio };
  }

  const input: Record<string, unknown> = { prompt: opts.prompt, aspect_ratio: ratio };

  if (opts.spec.sizeMode === "preset") {
    input["size"] = `${opts.width}*${opts.height}`;
  } else {
    input["width"] = opts.width;
    input["height"] = opts.height;
    input["size"] = `${opts.width}*${opts.height}`;
  }
  if (opts.steps != null) input["num_inference_steps"] = opts.steps;
  if (opts.guidance != null) {
    input["guidance"] = opts.guidance;
    input["guidance_scale"] = opts.guidance;
  }
  input["num_images"] = 1;
  input["image_format"] = "png";
  input["output_format"] = "png";
  if (opts.spec.supportsReference === "data" && opts.referenceImage && opts.referenceImage.length > 100) {
    input["image"] = `data:image/png;base64,${opts.referenceImage.toString("base64")}`;
    input["strength"] = RUNPOD_IDENTITY_STRENGTH;
  }
  return input;
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

