import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";
import {
  DEFAULT_ATLAS_LIPSYNC_MODEL,
  DEFAULT_ATLAS_VIDEO_MODEL,
  resolveAtlasLipSyncModel,
  resolveAtlasVideoModel,
} from "../atlas/catalog.js";
import { downloadUrl, generateVideo, requireAtlasApiKey, toDataUri, uploadBuffer } from "../atlas/client.js";

function pickDuration(supported: number[], wanted: number): number {
  if (supported.includes(wanted)) return wanted;
  return supported.find((d) => d >= wanted) ?? supported[supported.length - 1] ?? 5;
}

export class AtlasVideo implements VideoProvider {
  private apiKey: string;
  private modelId: string;
  private lipSyncModelId: string | null;
  readonly supportedDurations: number[];

  constructor(
    modelId: string = DEFAULT_ATLAS_VIDEO_MODEL,
    apiKey?: string,
    lipSyncModelId?: string | null,
  ) {
    this.apiKey = requireAtlasApiKey("video", apiKey);
    const spec = resolveAtlasVideoModel(modelId);
    this.modelId = spec.id;
    this.lipSyncModelId = lipSyncModelId === undefined ? DEFAULT_ATLAS_LIPSYNC_MODEL : lipSyncModelId;
    this.supportedDurations = spec.durations;
  }

  async generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    negativePrompt?: string;
    audio?: Buffer;
  }): Promise<VideoResult> {
    const spec = resolveAtlasVideoModel(this.modelId);
    const duration = pickDuration(spec.durations, opts.durationSeconds ?? spec.durations[0] ?? 5);
    const image = toDataUri(opts.sourceImage);

    const lip = this.lipSyncModelId ? resolveAtlasLipSyncModel(this.lipSyncModelId) : null;
    if (lip?.kind === "image_audio") {
      if (!opts.audio || opts.audio.length < 32) {
        throw new Error("Atlas image+audio lips needs scene audio (TTS runs before visuals)");
      }
      const audioUrl = await uploadBuffer(this.apiKey, opts.audio, "scene.wav");
      const url = await generateVideo(this.apiKey, lip.id, {
        prompt: opts.prompt,
        image,
        audio: audioUrl,
        resolution: "720p",
      });
      return this.writeClip(url, duration);
    }

    if (spec.talkingHead) {
      if (!opts.audio || opts.audio.length < 32) {
        throw new Error("Atlas InfiniteTalk needs scene audio (TTS runs before visuals)");
      }
      const audioUrl = await uploadBuffer(this.apiKey, opts.audio, "scene.wav");
      const url = await generateVideo(this.apiKey, spec.id, {
        prompt: opts.prompt,
        image,
        audio: audioUrl,
        resolution: "720p",
      });
      return this.writeClip(url, duration);
    }

    const extra: Record<string, unknown> = {
      prompt: opts.prompt,
      image,
      duration,
    };
    if (spec.id.includes("minimax/h3")) {
      extra["resolution"] = "768P";
    } else if (spec.id.includes("seedance")) {
      extra["resolution"] = "720p";
      extra["ratio"] = opts.aspectRatio === "16:9" ? "16:9" : opts.aspectRatio === "1:1" ? "1:1" : "9:16";
      extra["generate_audio"] = false;
      extra["watermark"] = false;
    } else if (spec.id.includes("wan-2.2-turbo")) {
      extra["resolution"] = "720p";
      if (opts.negativePrompt) extra["negative_prompt"] = opts.negativePrompt;
    } else if (spec.id.includes("wan-3.0") || spec.id.includes("gemini-omni")) {
      extra["ratio"] = opts.aspectRatio === "16:9" ? "16:9" : "9:16";
    } else if (spec.id.includes("kling-v3.0")) {
      extra["cfg_scale"] = 0.5;
      extra["sound"] = false;
      if (opts.negativePrompt) extra["negative_prompt"] = opts.negativePrompt;
    } else if (spec.id.includes("seedance-v1.5") || spec.id.includes("h3-max")) {
      extra["resolution"] = spec.id.includes("h3-max") ? "768P" : "720p";
    }

    const url = await generateVideo(this.apiKey, spec.id, extra);
    const clip = await this.writeClip(url, duration);

    if (this.lipSyncModelId && opts.audio && opts.audio.length > 32) {
      try {
        return await this.applyLipSync(clip, opts.audio);
      } catch (err) {
        console.warn(`[video/atlas] Lip-sync failed, keeping I2V clip: ${err}`);
        return clip;
      }
    }
    return clip;
  }

  private async applyLipSync(clip: VideoResult, audio: Buffer): Promise<VideoResult> {
    const lip = resolveAtlasLipSyncModel(this.lipSyncModelId ?? undefined);
    if (lip.kind !== "video_audio") return clip;
    const videoUrl = await uploadBuffer(this.apiKey, await fsp.readFile(clip.filePath), "clip.mp4");
    const audioUrl = await uploadBuffer(this.apiKey, audio, "scene.wav");
    const extra: Record<string, unknown> = { video_url: videoUrl, audio_url: audioUrl };
    if (lip.id === "sync/lipsync-v3") extra["sync_mode"] = "cut_off";
    const url = await generateVideo(this.apiKey, lip.id, extra);
    try {
      fs.unlinkSync(clip.filePath);
    } catch {
      /* ignore */
    }
    return this.writeClip(url, clip.durationSeconds);
  }

  private async writeClip(url: string, durationSeconds: number): Promise<VideoResult> {
    const buffer = await downloadUrl(url);
    const tmpPath = path.join(os.tmpdir(), `openreels-atlas-${Date.now()}.mp4`);
    await fsp.writeFile(tmpPath, buffer);
    if (fs.statSync(tmpPath).size < 50_000) {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      throw new Error(`Atlas video file too small (${buffer.length} bytes)`);
    }
    return { filePath: tmpPath, durationSeconds };
  }
}
