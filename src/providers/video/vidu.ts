import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";

const VIDU_BASE_URL = "https://api.vidu.com/ent/v2";

/**
 * VIDU models with their supported durations and approx credit cost per 5s clip:
 *   viduq3-pro       — Best quality + audio sync, 1-16s  (~80 cr/5s)
 *   viduq3-pro-fast  — High quality, faster, 1-16s       (~50 cr/5s)
 *   viduq3-turbo     — Fast q3, 1-16s                    (~60 cr/5s)
 *   viduq2-pro       — Excellent performance, 1-10s      (~35 cr/5s)
 *   viduq2-pro-fast  — Fast + low price, 1-10s           (~20 cr/5s)
 *   viduq2-turbo     — Good quality, fast, 1-10s         (~25 cr/5s)
 *   viduq1           — Stable camera, 5s only            (~12 cr/5s)
 *   viduq1-classic   — Richer transitions, 5s only       (~12 cr/5s)
 *   vidu2.0          — Fastest gen, 4s or 8s             (~10 cr/5s)
 */
const DEFAULT_MODEL = "viduq2-turbo";

// Plan allows 4 concurrent generations; the video-resolver's global pLimit(3) stays under that.
const POLL_INTERVAL_MS = 6_000;
const TIMEOUT_MS = 300_000; // 5 min

interface SubmitResponse {
  task_id?: string;
  state?: string;
  error?: string;
  message?: string;
}

interface Creation {
  id?: string;
  url?: string;
  cover_url?: string;
}

interface PollResponse {
  id?: string;
  state?: string; // created | queueing | processing | success | failed
  err_code?: string;
  err_msg?: string;
  creations?: Creation[];
  credits?: number;
  progress?: number;
}

function isRetryable(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET")
  );
}

export class ViduVideo implements VideoProvider {
  private apiKey: string;
  private model: string;

  // Duration support depends on model; we expose the union of all model options
  readonly supportedDurations = [5, 6, 8, 10];

  constructor(model: string = DEFAULT_MODEL, apiKey?: string) {
    const key = apiKey ?? process.env["VIDU_API_KEY"];
    if (!key) throw new Error("VIDU_API_KEY environment variable is required");
    this.apiKey = key;
    this.model = model;
  }

  async generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    negativePrompt?: string;
  }): Promise<VideoResult> {
    const duration = this.clampDuration(opts.durationSeconds ?? 6);
    const b64 = opts.sourceImage.toString("base64");

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.generateOnce(b64, opts.prompt, duration);
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === 2) break;
        const delay = 5000 * Math.pow(2, attempt);
        console.warn(`[video/vidu] Attempt ${attempt + 1} failed (${err}), retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  private clampDuration(target: number): number {
    // viduq1 and viduq1-classic only support 5s
    if (this.model === "viduq1" || this.model === "viduq1-classic") return 5;
    // vidu2.0 supports 4 or 8
    if (this.model === "vidu2.0") return target <= 4 ? 4 : 8;
    // q2 models: 1-10
    if (this.model.startsWith("viduq2")) return Math.min(Math.max(target, 1), 10);
    // q3 models: 1-16
    return Math.min(Math.max(target, 1), 16);
  }

  private async generateOnce(b64Image: string, prompt: string, duration: number): Promise<VideoResult> {
    // Submit task
    const submitRes = await fetch(`${VIDU_BASE_URL}/img2video`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        images: [`data:image/png;base64,${b64Image}`],
        prompt,
        duration,
        resolution: "1080p",
        movement_amplitude: "auto",
        off_peak: false,
      }),
    });

    if (!submitRes.ok) {
      const body = await submitRes.text().catch(() => "");
      throw new Error(`VIDU submit failed: ${submitRes.status} ${body}`);
    }

    const submit = (await submitRes.json()) as SubmitResponse;
    const taskId = submit.task_id;
    if (!taskId) {
      throw new Error(`VIDU: no task_id in response: ${JSON.stringify(submit)}`);
    }

    console.log(`[video/vidu] Task ${taskId} created (model=${this.model}, duration=${duration}s)`);

    // Poll for completion
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${VIDU_BASE_URL}/tasks/${taskId}/creations`, {
        headers: { Authorization: `Token ${this.apiKey}` },
      });

      if (!pollRes.ok) {
        const body = await pollRes.text().catch(() => "");
        throw new Error(`VIDU poll failed: ${pollRes.status} ${body}`);
      }

      const poll = (await pollRes.json()) as PollResponse;
      const state = poll.state;
      const videoUrl = poll.creations?.[0]?.url;

      console.log(`[video/vidu] Task ${taskId} poll — state=${state ?? "none"}, url=${videoUrl ? "yes" : "no"}`);

      const isDone = state === "success";
      const isFailed = state === "failed" || state === "error";

      if (isDone) {
        if (!videoUrl) {
          throw new Error(`VIDU: done but no video URL: ${JSON.stringify(poll)}`);
        }

        // Download video
        const tmpPath = path.join(os.tmpdir(), `openreels-vidu-${Date.now()}.mp4`);
        const dlRes = await fetch(videoUrl);
        if (!dlRes.ok) throw new Error(`VIDU video download failed: ${dlRes.status}`);

        const buffer = Buffer.from(await dlRes.arrayBuffer());
        if (buffer.length < 50_000) {
          throw new Error(`VIDU video too small (${buffer.length} bytes)`);
        }
        await fsp.writeFile(tmpPath, buffer);

        console.log(`[video/vidu] Task ${taskId} complete — ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
        return { filePath: tmpPath, durationSeconds: duration };
      }

      if (isFailed) {
        throw new Error(`VIDU task failed: ${poll.err_code ?? poll.err_msg ?? "unknown error"}`);
      }

      // no creations yet | processing — keep polling
    }

    throw new Error(`VIDU task ${taskId} timed out after ${TIMEOUT_MS / 1000}s`);
  }
}
