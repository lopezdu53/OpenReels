import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";

const XAI_BASE_URL = "https://api.x.ai/v1";
const MODEL = "grok-imagine-video";
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS = 300_000; // 5 min

interface GenerateResponse {
  request_id?: string;
  error?: string;
}

interface PollResponse {
  status?: string; // "pending" | "done" | "failed"
  progress?: number;
  model?: string;
  video?: {
    url?: string | null;
    duration?: number;
    respect_moderation?: boolean;
  };
  error?: {
    code?: string;
    message?: string;
  };
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

export class GrokVideo implements VideoProvider {
  private apiKey: string;

  readonly supportedDurations = [5, 6, 8, 10];

  constructor(apiKey?: string) {
    const key = apiKey ?? process.env["XAI_API_KEY"];
    if (!key) throw new Error("XAI_API_KEY environment variable is required");
    this.apiKey = key;
  }

  async generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    negativePrompt?: string;
  }): Promise<VideoResult> {
    const duration = Math.min(Math.max(Math.round(opts.durationSeconds ?? 8), 1), 15);
    const b64 = opts.sourceImage.toString("base64");

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.generateOnce(b64, opts.prompt, duration, opts.aspectRatio);
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === 2) break;
        const delay = 5000 * Math.pow(2, attempt);
        console.warn(`[video/grok] Attempt ${attempt + 1} failed (${err}), retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  private async generateOnce(
    b64Image: string,
    prompt: string,
    duration: number,
    aspectRatio?: string,
  ): Promise<VideoResult> {
    const body: Record<string, unknown> = {
      model: MODEL,
      prompt,
      image: { url: `data:image/png;base64,${b64Image}` },
      duration,
      resolution: "720p",
      aspect_ratio: aspectRatio ?? "9:16",
    };

    const submitRes = await fetch(`${XAI_BASE_URL}/videos/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!submitRes.ok) {
      const errBody = await submitRes.text().catch(() => "");
      throw new Error(`Grok video submit failed: ${submitRes.status} ${errBody}`);
    }

    const submit = (await submitRes.json()) as GenerateResponse;
    const requestId = submit.request_id;
    if (!requestId) {
      throw new Error(`Grok video: no request_id in response: ${JSON.stringify(submit)}`);
    }

    console.log(`[video/grok] Request ${requestId} created (duration=${duration}s)`);

    // Poll for completion
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${XAI_BASE_URL}/videos/${requestId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!pollRes.ok) {
        const errBody = await pollRes.text().catch(() => "");
        throw new Error(`Grok video poll failed: ${pollRes.status} ${errBody}`);
      }

      const poll = (await pollRes.json()) as PollResponse;
      console.log(`[video/grok] Request ${requestId} — status=${poll.status} progress=${poll.progress ?? 0}%`);

      if (poll.status === "done") {
        const videoUrl = poll.video?.url;
        if (!videoUrl) {
          throw new Error(`Grok video: done but no video URL (moderation=${poll.video?.respect_moderation})`);
        }

        const tmpPath = path.join(os.tmpdir(), `openreels-grok-${Date.now()}.mp4`);
        const dlRes = await fetch(videoUrl);
        if (!dlRes.ok) throw new Error(`Grok video download failed: ${dlRes.status}`);

        const buffer = Buffer.from(await dlRes.arrayBuffer());
        if (buffer.length < 50_000) {
          throw new Error(`Grok video too small (${buffer.length} bytes)`);
        }
        await fsp.writeFile(tmpPath, buffer);

        const actualDuration = poll.video?.duration ?? duration;
        console.log(`[video/grok] Request ${requestId} complete — ${(buffer.length / 1024 / 1024).toFixed(1)}MB, ${actualDuration}s`);
        return { filePath: tmpPath, durationSeconds: actualDuration };
      }

      if (poll.status === "failed") {
        throw new Error(`Grok video failed: ${poll.error?.message ?? poll.error?.code ?? "unknown error"}`);
      }

      // "pending" — keep polling
    }

    throw new Error(`Grok video request ${requestId} timed out after ${TIMEOUT_MS / 1000}s`);
  }
}
