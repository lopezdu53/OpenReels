import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getVideoDuration } from "../../pipeline/utils.js";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";
import { bridgeGenerateVideo, gflowBridgeUrl } from "../gflow/bridge.js";
import {
  GFLOW_DEFAULT_CLIP_SECONDS,
  gflowCliDuration,
  gflowI2vFallbackT2vEnabled,
  gflowI2vShouldFallbackT2v,
  resolveGflowVideoMode,
  resolveGflowVideoModel,
  type GflowVideoMode,
} from "../gflow/catalog.js";
import { GflowCliError, runGflowJson } from "../gflow/client.js";

export const DURATION_FALLBACK_NOTE =
  "gflow no pudo fijar la duración; se usó la duración por defecto de Flow";

export function isDurationControlError(message: string): boolean {
  const low = message.toLowerCase();
  return low.includes("configurationerror") && low.includes("duration control");
}

export function stripDurationFlag(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--duration") {
      i += 1;
      continue;
    }
    out.push(args[i]!);
  }
  return out;
}

export function buildGflowVideoCliArgs(opts: {
  mode: GflowVideoMode;
  prompt: string;
  model: string;
  aspect: string;
  dest: string;
  durationSeconds?: number;
  stillPath?: string;
}): string[] {
  const spec = resolveGflowVideoModel(opts.model);
  const duration = gflowCliDuration(spec.id, opts.durationSeconds);
  const durationArgs = duration != null ? ["--duration", String(duration)] : [];
  const common = ["--model", spec.id, ...durationArgs, "--aspect", opts.aspect, "-o", opts.dest];
  if (opts.mode === "i2v") {
    if (!opts.stillPath) throw new GflowCliError("imagePng requerido (still PNG)");
    return ["video", "i2v", "--initial-frame", opts.stillPath, opts.prompt, ...common];
  }
  return ["video", "t2v", opts.prompt, ...common];
}

export async function runGflowVideoWithDurationFallback(
  args: string[],
  timeoutMs: number,
  onFallback?: () => void,
): Promise<Record<string, unknown>> {
  try {
    return await runGflowJson(args, timeoutMs);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!args.includes("--duration") || !isDurationControlError(msg)) throw err;
    onFallback?.();
    return runGflowJson(stripDurationFlag(args), timeoutMs);
  }
}

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
    let usedDefaultDuration = false;
    const noteFallback = () => {
      usedDefaultDuration = true;
      console.warn(`[video/gflow] ${DURATION_FALLBACK_NOTE}`);
    };

    if (gflowBridgeUrl()) {
      const result = await bridgeGenerateVideo({
        prompt: opts.prompt,
        aspect,
        model: this.modelId,
        durationSeconds: cliDuration,
        mode: this.mode,
        imagePng: useStill ? opts.sourceImage : undefined,
      });
      const probed = getVideoDuration(result.filePath);
      return {
        filePath: result.filePath,
        durationSeconds: probed && probed > 0.4 ? probed : (result.durationSeconds ?? reported),
        usedDefaultDuration,
      };
    }

    const dest = path.join(os.tmpdir(), `openreels-gflow-${Date.now()}.mp4`);
    const stillPath = useStill ? writeTempPng(opts.sourceImage) : undefined;
    const t2vArgs = buildGflowVideoCliArgs({
      mode: "t2v",
      prompt: opts.prompt,
      model: this.modelId,
      aspect,
      dest,
      durationSeconds: opts.durationSeconds,
    });
    const args = buildGflowVideoCliArgs({
      mode: this.mode,
      prompt: opts.prompt,
      model: this.modelId,
      aspect,
      dest,
      durationSeconds: opts.durationSeconds,
      stillPath,
    });

    let payload: Record<string, unknown>;
    try {
      payload = await runGflowVideoWithDurationFallback(args, 480_000, noteFallback);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!useStill || !gflowI2vShouldFallbackT2v(msg) || !gflowI2vFallbackT2vEnabled()) throw err;
      console.warn(`[video/gflow] I2V failed (${msg.slice(0, 160)}); t2v fallback (credits)`);
      payload = await runGflowVideoWithDurationFallback(t2vArgs, 480_000, noteFallback);
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
    const probed = getVideoDuration(local);
    return {
      filePath: local,
      durationSeconds: probed && probed > 0.4 ? probed : reported,
      usedDefaultDuration,
    };
  }
}

function writeTempPng(buf: Buffer): string {
  const dest = path.join(os.tmpdir(), `openreels-gflow-still-${Date.now()}.png`);
  fs.writeFileSync(dest, buf);
  return dest;
}
