import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";
import { bridgeGenerateVideo, gflowBridgeUrl } from "../gflow/bridge.js";
import {
  pickGflowDuration,
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
    const duration = pickGflowDuration(this.modelId, opts.durationSeconds);
    const useStill = this.mode === "i2v";
    if (gflowBridgeUrl()) {
      return bridgeGenerateVideo({
        prompt: opts.prompt,
        aspect,
        model: this.modelId,
        durationSeconds: duration,
        mode: this.mode,
        imagePng: useStill ? opts.sourceImage : undefined,
      });
    }

    const dest = path.join(os.tmpdir(), `openreels-gflow-${Date.now()}.mp4`);
    const args = useStill
      ? [
          "video",
          "i2v",
          "--initial-frame",
          writeTempPng(opts.sourceImage),
          opts.prompt,
          "--model",
          this.modelId,
          "--duration",
          String(duration),
          "--aspect",
          aspect,
          "-o",
          dest,
        ]
      : [
          "video",
          "t2v",
          opts.prompt,
          "--model",
          this.modelId,
          "--duration",
          String(duration),
          "--aspect",
          aspect,
          "-o",
          dest,
        ];

    const payload = await runGflowJson(args, 480_000);

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
    return { filePath: local, durationSeconds: duration };
  }
}

function writeTempPng(buf: Buffer): string {
  const dest = path.join(os.tmpdir(), `openreels-gflow-still-${Date.now()}.png`);
  fs.writeFileSync(dest, buf);
  return dest;
}
