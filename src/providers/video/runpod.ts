import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";
import {
  canonicalizeRunPodVideoModelId,
  DEFAULT_RUNPOD_VIDEO_MODEL,
  getRunPodVideoModel,
  isRunPodPublicModelId,
} from "../runpod/catalog.js";
import { extractMediaBuffer, isRunPodRetryable, runPodJob } from "../runpod/client.js";

const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 420_000;

export interface RunPodVideoConfig {
  model?: string;
  endpointId?: string;
  apiKey?: string;
  resolution?: string;
}

function resolveEndpoint(config: RunPodVideoConfig): { endpointId: string; modelId: string } {
  const modelId = canonicalizeRunPodVideoModelId(config.model ?? DEFAULT_RUNPOD_VIDEO_MODEL);
  if (modelId === "custom") {
    const ep = config.endpointId ?? process.env["RUNPOD_VIDEO_ENDPOINT_ID"];
    if (!ep) throw new Error("RUNPOD_VIDEO_ENDPOINT_ID is required for a custom RunPod video endpoint");
    return { endpointId: ep, modelId };
  }
  if (config.endpointId && !config.model) {
    return { endpointId: config.endpointId, modelId: "custom" };
  }
  return { endpointId: modelId, modelId };
}

function sizeFor(aspectRatio: string | undefined, resolution: string): string {
  const landscape = aspectRatio === "16:9";
  if (resolution === "1080p") return landscape ? "1920*1080" : "1080*1920";
  if (resolution === "480p") return landscape ? "854*480" : "480*854";
  return landscape ? "1280*720" : "720*1280";
}

function isHttpImageUrl(value: string | undefined): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

/** Build the `/run` input object for a public or custom RunPod video endpoint. */
export function buildRunPodVideoJobInput(opts: {
  modelId: string;
  prompt: string;
  /** HTTPS URL preferred. data: URIs break p-video ("property input is required"). */
  image?: string;
  duration: number;
  aspectRatio?: string;
  resolution: string;
  negativePrompt?: string;
}): Record<string, unknown> {
  const spec = getRunPodVideoModel(opts.modelId);
  const fields: Record<string, unknown> = {
    prompt: opts.prompt,
    duration: opts.duration,
  };

  const image = opts.image?.trim();
  const httpImage = isHttpImageUrl(image) ? image : undefined;
  // p-video / WaveSpeed only accept a hosted image URL. A data: URI is
  // forwarded to their internal API without `input` and fails with 400.
  if (httpImage) {
    fields["image"] = httpImage;
  } else if (image && !spec.nestedInput) {
    fields["image"] = image;
  }

  // Docs: when `image` is set, p-video ignores aspect_ratio.
  if (!(spec.nestedInput && httpImage)) {
    fields["aspect_ratio"] = opts.aspectRatio ?? "9:16";
  }

  if (spec.sizeParam === "resolution") {
    fields["resolution"] = opts.resolution;
  } else if (spec.sizeParam === "size") {
    fields["size"] = sizeFor(opts.aspectRatio, opts.resolution);
  }

  // p-video / WaveSpeed rejects unknown keys (negative_prompt, seed).
  // runPodJob already wraps the body as { input: fields } — never nest again
  // or P_VideoInput sees { input: {...} } and reports "prompt Field required".
  if (!spec.nestedInput) {
    fields["negative_prompt"] = opts.negativePrompt ?? "";
    fields["seed"] = -1;
  }

  if (opts.modelId === "wan-2-6-i2v" || spec.kind === "custom") {
    fields["shot_type"] = "single";
  }
  if (spec.kind === "custom") {
    fields["num_frames"] = Math.round(opts.duration * 16);
    fields["fps"] = 16;
  }

  return fields;
}

export class RunPodVideo implements VideoProvider {
  private apiKey: string;
  private endpointId: string;
  private modelId: string;
  private resolution: string;
  readonly supportedDurations: number[];

  constructor(modelOrConfig?: string | RunPodVideoConfig, apiKey?: string) {
    const config: RunPodVideoConfig =
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
      config.endpointId = process.env["RUNPOD_VIDEO_ENDPOINT_ID"];
      config.model = process.env["RUNPOD_VIDEO_MODEL"] ?? (config.endpointId ? "custom" : DEFAULT_RUNPOD_VIDEO_MODEL);
    }

    const resolved = resolveEndpoint(config);
    const spec = getRunPodVideoModel(resolved.modelId);
    this.apiKey = key;
    this.endpointId = resolved.endpointId;
    this.modelId = resolved.modelId;
    this.resolution = config.resolution && spec.resolutions.includes(config.resolution)
      ? config.resolution
      : (spec.resolutions[0] ?? "720p");
    this.supportedDurations = spec.durations;
  }

  async generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    negativePrompt?: string;
    imageUrl?: string;
  }): Promise<VideoResult> {
    const allowed = this.supportedDurations;
    const requested = Math.round(opts.durationSeconds ?? allowed[0] ?? 5);
    const duration = allowed.reduce((best, d) =>
      Math.abs(d - requested) < Math.abs(best - requested) ? d : best,
    allowed[0] ?? 5);

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.runJob(
          opts.sourceImage,
          opts.prompt,
          duration,
          opts.aspectRatio,
          opts.negativePrompt,
          opts.imageUrl,
        );
      } catch (err) {
        lastError = err;
        if (!isRunPodRetryable(err) || attempt === 2) break;
        const delay = 5000 * Math.pow(2, attempt);
        console.warn(`[video/runpod] Attempt ${attempt + 1} failed (${err}), retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  private async runJob(
    sourceImage: Buffer,
    prompt: string,
    duration: number,
    aspectRatio?: string,
    negativePrompt?: string,
    imageUrl?: string,
  ): Promise<VideoResult> {
    const hosted = isHttpImageUrl(imageUrl) ? imageUrl.trim() : undefined;
    const spec = getRunPodVideoModel(this.modelId);
    const image = hosted ?? (spec.nestedInput ? undefined : `data:image/png;base64,${sourceImage.toString("base64")}`);
    if (hosted) {
      console.log(`[video/runpod] I2V from hosted still ${hosted.slice(0, 80)}`);
    } else if (spec.nestedInput) {
      console.log("[video/runpod] no hosted still URL — p-video text-to-video (aspect_ratio)");
    }
    const input = buildRunPodVideoJobInput({
      modelId: this.modelId,
      prompt,
      image,
      duration,
      aspectRatio,
      resolution: this.resolution,
      negativePrompt,
    });

    const output = await runPodJob({
      endpointId: this.endpointId,
      apiKey: this.apiKey,
      input,
      pollMs: POLL_INTERVAL_MS,
      timeoutMs: TIMEOUT_MS,
      logPrefix: "video/runpod",
    });

    const buffer = await extractMediaBuffer(output, "video");
    if (!buffer || buffer.length < 50_000) {
      throw new Error("RunPod video: completed but no valid video in output");
    }

    const tmpPath = path.join(process.env["TMPDIR"] ?? "/tmp", `openreels-runpod-${Date.now()}.mp4`);
    await fsp.writeFile(tmpPath, buffer);
    console.log(`[video/runpod] complete — ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
    return { filePath: tmpPath, durationSeconds: duration };
  }
}
