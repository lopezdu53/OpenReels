import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";
import { bridgeGenerateVideo, gflowBridgeUrl } from "../gflow/bridge.js";
import {
  GFLOW_DEFAULT_CLIP_SECONDS,
  gflowCliDuration,
  gflowI2vShouldFallbackT2v,
  resolveGflowVideoMode,
  resolveGflowVideoModel,
  type GflowVideoMode,
} from "../gflow/catalog.js";
import { GflowCliError, runGflowJson } from "../gflow/client.js";

export class GflowVideo implements VideoProvider {
  private modelId: string;
  private mode: GflowVideoMode;
  readonly supportedDurations: number[];

  constructor(modelId?: string, mode?: string) {
    const spec = resolveGflowVideoModel(modelId);
    this.modelId = spec.id;
    this.mode = resolveGflowVideoMode(mode);
    this.supportedDurations = [...spec.durations];
  }

  async generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
  }): Promise<VideoResult> {
    const aspect = opts.aspectRatio === "9:16" ? "9:16" : "16:9";
    const cliDuration = gflowCliDuration(this.modelId, opts.durationSeconds);
    const reported = cliDuration ?? GFLOW_DEFAULT_CLIP_SECONDS;
    const useStill = this.mode === "i2v";
    if (gflowBridgeUrl()) {
      return bridgeGenerateVideo({
        prompt: opts.prompt,
        aspect,
        model: this.modelId,
        durationSeconds: cliDuration,
        mode: this.mode,
        imagePng: useStill ? opts.sourceImage : undefined,
      });
    }

    const dest = path.join(os.tmpdir(), `openreels-gflow-${Date.now()}.mp4`);
    const durationArgs = cliDuration != null ? ["--duration", String(cliDuration)] : [];
    const t2vArgs = [
      "video",
      "t2v",
      opts.prompt,
      "--model",
      this.modelId,
      ...durationArgs,
      "--aspect",
      aspect,
      "-o",
      dest,
    ];
    const args = useStill
      ? [
          "video",
          "i2v",
          "--initial-frame",
          writeTempPng(opts.sourceImage),
          opts.prompt,
          "--model",
          this.modelId,
          ...durationArgs,
          "--aspect",
          aspect,
          "-o",
          dest,
        ]
      : t2vArgs;

    let payload: Record<string, unknown>;
    try {
      payload = await runGflowJson(args, 480_000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!useStill || !gflowI2vShouldFallbackT2v(msg)) throw err;
      console.warn(`[video/gflow] I2V failed (${msg.slice(0, 160)}); retrying t2v`);
      payload = await runGflowJson(t2vArgs, 480_000);
    }

    const local =
      fs.existsSync(dest) && fs.statSync(dest).size > 1000
        ? dest
        : typeof payload["local_path"] === "string"
          ? payload["local_path"]
          : "";
    if (!local || !fs.existsSync(local)) {
      throw new GflowCliError("gflow video no escribió el mp4");
    }
    const size = fs.statSync(local).size;
    if (size < 20_000) throw new GflowCliError(`gflow video too small (${size} bytes)`);
    return { filePath: local, durationSeconds: reported };
  }
}

function writeTempPng(buf: Buffer): string {
  const dest = path.join(os.tmpdir(), `openreels-gflow-still-${Date.now()}.png`);
  fs.writeFileSync(dest, buf);
  return dest;
}
