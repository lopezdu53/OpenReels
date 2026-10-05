import type { VideoProvider, VideoResult } from "../../schema/providers.js";
import { GFLOW_DEFAULT_CLIP_SECONDS } from "../gflow/catalog.js";
import {
  resolveTobyVideoMode,
  resolveTobyVideoModel,
  type TobyVideoMode,
} from "../toby/catalog.js";
import { generateTobyVideo } from "../toby/generate.js";

export class TobyVideo implements VideoProvider {
  private modelId: string;
  private mode: TobyVideoMode;
  readonly supportedDurations: number[];

  constructor(modelId?: string, mode?: string) {
    const spec = resolveTobyVideoModel(modelId);
    this.modelId = spec.id;
    this.mode = resolveTobyVideoMode(mode);
    this.supportedDurations = [...spec.durations];
  }

  async generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
  }): Promise<VideoResult> {
    const aspect = opts.aspectRatio === "9:16" ? "9:16" : "16:9";
    const result = await generateTobyVideo({
      prompt: opts.prompt,
      aspect,
      model: this.modelId,
      mode: this.mode,
      durationSeconds: opts.durationSeconds,
      stillPng: this.mode === "i2v" ? opts.sourceImage : undefined,
    });
    return {
      filePath: result.filePath,
      durationSeconds: result.durationSeconds || opts.durationSeconds || GFLOW_DEFAULT_CLIP_SECONDS,
    };
  }
}
