import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";

// Alibaba Cloud MaaS OpenAI-compatible endpoint
const ALICLOUD_BASE_URL =
  process.env["ALICLOUD_BASE_URL"] ??
  "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";

const POLL_INTERVAL_MS = 8_000;
const TIMEOUT_MS = 720_000; // 12 minutes

// Available Wan image-to-video models:
//   wan2.1-i2v-turbo  — faster, lower cost (default)
//   wan2.1-i2v-plus   — higher quality, slower
const DEFAULT_MODEL = "wan2.1-i2v-turbo";

export class AliCloudVideo implements VideoProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  readonly supportedDurations = [5, 10];

  constructor(model?: string, apiKey?: string) {
    const key = apiKey ?? process.env["ALICLOUD_API_KEY"];
    if (!key) throw new Error("ALICLOUD_API_KEY environment variable is required for video generation");
    this.apiKey = key;
    this.model = model ?? process.env["ALICLOUD_VIDEO_MODEL"] ?? DEFAULT_MODEL;
    this.baseUrl = ALICLOUD_BASE_URL;
  }

  private get authHeader() {
    return { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  async generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    negativePrompt?: string;
  }): Promise<VideoResult> {
    const durationSeconds = (opts.durationSeconds ?? 5) >= 9 ? 10 : 5;
    const aspectRatio = opts.aspectRatio ?? "9:16";

    // Map aspect ratio to Alibaba Cloud size format (width*height)
    const sizeMap: Record<string, string> = {
      "9:16": "720*1280",
      "16:9": "1280*720",
      "1:1":  "960*960",
    };
    const size = sizeMap[aspectRatio] ?? "720*1280";

    // Alibaba Cloud accepts base64 image with data URI prefix
    const imageDataUri = `data:image/png;base64,${opts.sourceImage.toString("base64")}`;

    const submitRes = await fetch(`${this.baseUrl}/video/generations`, {
      method: "POST",
      headers: this.authHeader,
      body: JSON.stringify({
        model: this.model,
        prompt: opts.prompt,
        input: { img: imageDataUri },
        parameters: {
          size,
          duration: durationSeconds,
          ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
        },
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({}));
      throw new Error(`AliCloud video submit failed (${submitRes.status}): ${JSON.stringify(err)}`);
    }

    const submitData = (await submitRes.json()) as {
      output?: { task_id?: string; task_status?: string };
      request_id?: string;
      id?: string;
    };

    const taskId = submitData.output?.task_id ?? submitData.id;
    if (!taskId) throw new Error(`AliCloud did not return a task_id: ${JSON.stringify(submitData)}`);

    // Poll until succeeded / failed / timeout
    const deadline = Date.now() + TIMEOUT_MS;
    while (true) {
      if (Date.now() > deadline) {
        throw new Error(`AliCloud video generation timed out after ${TIMEOUT_MS / 1000}s`);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${this.baseUrl}/video/generations/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!pollRes.ok) {
        throw new Error(`AliCloud video poll failed (${pollRes.status})`);
      }

      const poll = (await pollRes.json()) as {
        output?: {
          task_status?: string;
          task_id?: string;
          video_url?: string;
          message?: string;
          code?: string;
        };
        status?: string;
        video_url?: string;
      };

      // Support both nested (output.task_status) and flat (status) response formats
      const status = poll.output?.task_status ?? poll.status;
      const videoUrl = poll.output?.video_url ?? poll.video_url;

      if (status === "SUCCEEDED" || status === "succeeded") {
        if (!videoUrl) throw new Error("AliCloud task succeeded but returned no video_url");

        const tmpPath = path.join(os.tmpdir(), `openreels-alicloud-${Date.now()}.mp4`);
        const videoRes = await fetch(videoUrl);
        if (!videoRes.ok) throw new Error(`Failed to download AliCloud video: ${videoRes.status}`);
        const buffer = Buffer.from(await videoRes.arrayBuffer());
        await fsp.writeFile(tmpPath, buffer);

        if (fs.statSync(tmpPath).size === 0) throw new Error("AliCloud video download produced empty file");
        return { filePath: tmpPath, durationSeconds };
      }

      if (status === "FAILED" || status === "failed") {
        const msg = poll.output?.message ?? poll.output?.code ?? "unknown error";
        throw new Error(`AliCloud video generation failed: ${msg}`);
      }

      // PENDING / RUNNING — keep polling
    }
  }
}
