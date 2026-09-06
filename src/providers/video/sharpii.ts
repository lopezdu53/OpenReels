import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";
import { DEFAULT_SHARPII_VIDEO_MODEL, resolveSharpiiVideoModel } from "../sharpii/catalog.js";
import { downloadUrl, sharpiiGenerate, toDataUri } from "../sharpii/client.js";

export class SharpiiVideo implements VideoProvider {
  private apiKey: string;
  private modelId: string;
  readonly supportedDurations: number[];

  constructor(modelId: string = DEFAULT_SHARPII_VIDEO_MODEL, apiKey?: string) {
    const key = apiKey ?? process.env["SHARPII_API_KEY"];
    if (!key) throw new Error("SHARPII_API_KEY environment variable is required for video generation");
    const spec = resolveSharpiiVideoModel(modelId);
    this.apiKey = key;
    this.modelId = spec.id;
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
    const spec = resolveSharpiiVideoModel(this.modelId);
    const wanted = opts.durationSeconds ?? spec.durations[0] ?? 5;
    const duration = spec.durations.includes(wanted)
      ? wanted
      : spec.durations.find((d) => d >= wanted) ?? spec.durations[spec.durations.length - 1]!;
    const firstFrame =
      opts.imageUrl?.startsWith("http") ? opts.imageUrl : toDataUri(opts.sourceImage);
    const klingI2v = spec.id.includes("kling") && spec.id.includes("i2v");
    const audioSync = spec.audioSync ?? (spec.id.startsWith("sora-") ? "native" : "optional");

    const outputs = await sharpiiGenerate(this.apiKey, "/videos/generate", {
      model: spec.id,
      prompt: opts.prompt,
      duration,
      ...(!klingI2v ? { aspect_ratio: opts.aspectRatio === "16:9" ? "16:9" : "9:16" } : {}),
      ...(spec.i2v ? { first_frame_url: firstFrame } : {}),
      ...(opts.negativePrompt && spec.id.includes("kling") ? { negative_prompt: opts.negativePrompt } : {}),
      ...(audioSync === "optional" ? { audio_sync: false } : {}),
    });
    const url = outputs.find((o) => o.url)?.url;
    if (!url) throw new Error("Sharpii video returned no URL");
    const buffer = await downloadUrl(url);
    const tmpPath = path.join(os.tmpdir(), `openreels-sharpii-${Date.now()}.mp4`);
    await fsp.writeFile(tmpPath, buffer);
    if (fs.statSync(tmpPath).size < 50_000) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      throw new Error(`Sharpii video file too small (${buffer.length} bytes)`);
    }
    return { filePath: tmpPath, durationSeconds: outputs[0]?.duration_seconds ?? duration };
  }
}
