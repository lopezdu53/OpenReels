import * as fsp from "node:fs/promises";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";

const RUNPOD_BASE = "https://api.runpod.ai/v2";
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 300_000; // 5 min

interface RunPodStatus {
  id: string;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  output?: unknown;
  error?: string;
}

function isRetryable(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET")
  );
}

export class RunPodVideo implements VideoProvider {
  private apiKey: string;
  private endpointId: string;

  readonly supportedDurations = [2, 3, 4, 5, 6, 8];

  constructor(endpointId?: string, apiKey?: string) {
    const key = apiKey ?? process.env["RUNPOD_API_KEY"];
    const ep = endpointId ?? process.env["RUNPOD_VIDEO_ENDPOINT_ID"];
    if (!key) throw new Error("RUNPOD_API_KEY environment variable is required");
    if (!ep) throw new Error("RUNPOD_VIDEO_ENDPOINT_ID environment variable is required");
    this.apiKey = key;
    this.endpointId = ep;
  }

  async generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    negativePrompt?: string;
  }): Promise<VideoResult> {
    const duration = Math.min(Math.max(Math.round(opts.durationSeconds ?? 5), 2), 8);

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.runJob(opts.sourceImage, opts.prompt, duration, opts.aspectRatio, opts.negativePrompt);
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === 2) break;
        const delay = 5000 * Math.pow(2, attempt);
        console.warn(`[video/runpod] Attempt ${attempt + 1} failed (${err}), retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  private async runJob(
    sourceImage: Buffer,
    prompt: string,
    duration: number,
    aspectRatio?: string,
    negativePrompt?: string,
  ): Promise<VideoResult> {
    const b64 = sourceImage.toString("base64");

    const submitRes = await fetch(`${RUNPOD_BASE}/${this.endpointId}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          image: `data:image/png;base64,${b64}`,
          prompt,
          negative_prompt: negativePrompt ?? "",
          duration,
          aspect_ratio: aspectRatio ?? "9:16",
          num_frames: Math.round(duration * 16),
          fps: 16,
        },
      }),
    });

    if (!submitRes.ok) {
      const errBody = await submitRes.text().catch(() => "");
      throw new Error(`RunPod video submit failed: ${submitRes.status} ${errBody}`);
    }

    const submit = (await submitRes.json()) as { id: string };
    const jobId = submit.id;
    if (!jobId) throw new Error(`RunPod video: no job id in response: ${JSON.stringify(submit)}`);

    console.log(`[video/runpod] Job ${jobId} submitted (duration=${duration}s)`);

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${RUNPOD_BASE}/${this.endpointId}/status/${jobId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!pollRes.ok) {
        const errBody = await pollRes.text().catch(() => "");
        throw new Error(`RunPod video poll failed: ${pollRes.status} ${errBody}`);
      }

      const poll = (await pollRes.json()) as RunPodStatus;
      console.log(`[video/runpod] Job ${jobId} — status=${poll.status}`);

      if (poll.status === "COMPLETED") {
        const buffer = await extractVideoBuffer(poll.output);
        if (!buffer || buffer.length < 50_000) {
          throw new Error(`RunPod video: completed but no valid video in output`);
        }

        const tmpPath = path.join(process.env["TMPDIR"] ?? "/tmp", `openreels-runpod-${Date.now()}.mp4`);
        await fsp.writeFile(tmpPath, buffer);
        console.log(`[video/runpod] Job ${jobId} complete — ${(buffer.length / 1024 / 1024).toFixed(1)}MB`);
        return { filePath: tmpPath, durationSeconds: duration };
      }

      if (poll.status === "FAILED" || poll.status === "CANCELLED") {
        throw new Error(`RunPod video job ${poll.status.toLowerCase()}: ${poll.error ?? "unknown error"}`);
      }
    }

    throw new Error(`RunPod video job ${jobId} timed out after ${TIMEOUT_MS / 1000}s`);
  }
}

async function extractVideoBuffer(output: unknown): Promise<Buffer | null> {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;

  // Common Wan/video worker formats: base64 string
  const b64 =
    (typeof o["video"] === "string" ? o["video"] : null) ??
    (typeof o["video_base64"] === "string" ? o["video_base64"] : null) ??
    (typeof o["output"] === "string" ? o["output"] : null);

  if (b64) return Buffer.from(b64, "base64");

  // URL-based output — download
  const url =
    (typeof o["video_url"] === "string" ? o["video_url"] : null) ??
    (typeof o["url"] === "string" ? o["url"] : null) ??
    (Array.isArray(o["videos"]) && typeof o["videos"][0] === "string" ? o["videos"][0] : null);

  if (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`RunPod video URL download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  return null;
}
