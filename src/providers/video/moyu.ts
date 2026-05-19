import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";

const API_BASE = "https://www.moyu.info/v1";
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 300_000;

// Default model — override via MOYU_VIDEO_MODEL env var.
// Common MOYU model IDs: kling-v2-pro, kling-v2.1-pro, kling-v2, seedance-v2, doubao, happy-horse
const DEFAULT_MODEL = "kling-v2-pro";

export class MoyuVideo implements VideoProvider {
  private apiKey: string;
  private model: string;

  readonly supportedDurations = [5, 10];

  constructor(model?: string, apiKey?: string) {
    const key = apiKey ?? process.env["MOYU_API_KEY"];
    if (!key) throw new Error("MOYU_API_KEY environment variable is required for MOYU video generation");
    this.apiKey = key;
    this.model = model ?? process.env["MOYU_VIDEO_MODEL"] ?? DEFAULT_MODEL;
  }

  async generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    negativePrompt?: string;
  }): Promise<VideoResult> {
    // MOYU only supports 5 or 10 seconds
    const durationSeconds = (opts.durationSeconds ?? 5) <= 5 ? 5 : 10;
    const aspectRatio = opts.aspectRatio ?? "9:16";

    // MOYU expects raw base64 string (no data URI prefix)
    const imageBase64 = opts.sourceImage.toString("base64");

    const submitRes = await fetch(`${API_BASE}/video/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: opts.prompt,
        image: imageBase64,
        duration: durationSeconds,
        mode: "pro",
        metadata: {
          aspect_ratio: aspectRatio,
          cfg_scale: 0.6,
          ...(opts.negativePrompt ? { negative_prompt: opts.negativePrompt } : {}),
        },
      }),
    });

    if (!submitRes.ok) {
      const err = await submitRes.json().catch(() => ({}));
      throw new Error(`MOYU submit failed (${submitRes.status}): ${JSON.stringify(err)}`);
    }

    const submitData = (await submitRes.json()) as { task_id?: string; id?: string };
    const taskId = submitData.task_id ?? submitData.id;
    if (!taskId) throw new Error("MOYU did not return a task_id");

    // Poll until succeeded / failed / timeout
    const deadline = Date.now() + TIMEOUT_MS;
    while (true) {
      if (Date.now() > deadline) {
        throw new Error(`MOYU video generation timed out after ${TIMEOUT_MS / 1000}s`);
      }

      await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${API_BASE}/videos/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!pollRes.ok) {
        throw new Error(`MOYU poll failed (${pollRes.status})`);
      }

      const poll = (await pollRes.json()) as {
        status: string;
        video_url?: string;
        error?: { message?: string; code?: string };
      };

      if (poll.status === "succeeded") {
        if (!poll.video_url) {
          throw new Error("MOYU task succeeded but returned no video_url");
        }

        const tmpPath = path.join(os.tmpdir(), `openreels-moyu-${Date.now()}.mp4`);
        const videoRes = await fetch(poll.video_url);
        if (!videoRes.ok) {
          throw new Error(`Failed to download MOYU video: ${videoRes.status}`);
        }
        const buffer = Buffer.from(await videoRes.arrayBuffer());
        await fsp.writeFile(tmpPath, buffer);

        if (fs.statSync(tmpPath).size === 0) {
          throw new Error("MOYU video download produced an empty file");
        }

        return { filePath: tmpPath, durationSeconds };
      }

      if (poll.status === "failed") {
        const msg = poll.error?.message ?? "unknown error";
        throw new Error(`MOYU video generation failed: ${msg}`);
      }

      // status "queued" or "processing" — keep polling
    }
  }
}
