import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";

const API_BASE = "https://www.moyu.info/v1";
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 300_000;

// Default model — override via MOYU_VIDEO_MODEL env var.
// Image-to-video models on MOYU:
//   Kling:    kling-v2-6 | kling-v2-1-master | kling-v2-5-turbo | kling-v2-master | kling-v2-1 | kling-v2 | kling-video-o1
//   Seedance: doubao-seedance-2-0-260128 | doubao-seedance-2-0-fast-260128 | doubao-seedance-1-5-pro-251215
//   Happy:    happyhorse-1.0-i2v
const DEFAULT_MODEL = "kling-v2-6";

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
    // MOYU supports 5 or 10 seconds. Default to 5s (cheaper) unless scene is very long.
    // At ~¥1.20/5s vs ¥2.40/10s, defaulting to 5s halves the cost per clip.
    const durationSeconds = (opts.durationSeconds ?? 5) >= 9 ? 10 : 5;
    const aspectRatio = opts.aspectRatio ?? "9:16";

    // MOYU expects raw base64 string (no data URI prefix)
    const imageBase64 = opts.sourceImage.toString("base64");

    const body = JSON.stringify({
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
    });

    // Submit with retry on concurrency-limit 403
    let submitRes: Response;
    const MAX_SUBMIT_RETRIES = 6;
    for (let attempt = 0; attempt <= MAX_SUBMIT_RETRIES; attempt++) {
      submitRes = await fetch(`${API_BASE}/video/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
      });

      if (submitRes.ok) break;

      const err = await submitRes.json().catch(() => ({})) as Record<string, unknown>;
      const isConcurrencyLimit =
        submitRes.status === 403 &&
        typeof err["code"] === "string" &&
        (err["code"] as string).includes("concurrency");

      if (isConcurrencyLimit && attempt < MAX_SUBMIT_RETRIES) {
        const waitMs = 15_000 + attempt * 10_000; // 15s, 25s, 35s, 45s, 55s, 65s
        console.warn(`[moyu] Concurrency limit hit, retrying in ${waitMs / 1000}s (attempt ${attempt + 1}/${MAX_SUBMIT_RETRIES})`);
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
        continue;
      }

      throw new Error(`MOYU submit failed (${submitRes.status}): ${JSON.stringify(err)}`);
    }

    if (!submitRes!.ok) {
      const err = await submitRes!.json().catch(() => ({}));
      throw new Error(`MOYU submit failed after retries (${submitRes!.status}): ${JSON.stringify(err)}`);
    }

    const submitData = (await submitRes!.json()) as { task_id?: string; id?: string };
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
