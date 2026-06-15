import type { ImageProvider } from "../../schema/providers.js";

const RUNPOD_BASE = "https://api.runpod.ai/v2";
const POLL_INTERVAL_MS = 3_000;
const TIMEOUT_MS = 180_000;

// Portrait dimensions (9:16) and landscape (16:9) for FLUX-compatible workers
const DIMENSIONS: Record<string, { width: number; height: number }> = {
  portrait: { width: 832, height: 1216 },
  landscape: { width: 1216, height: 832 },
};

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

export class RunPodImage implements ImageProvider {
  private apiKey: string;
  private endpointId: string;

  constructor(endpointId?: string, apiKey?: string) {
    const key = apiKey ?? process.env["RUNPOD_API_KEY"];
    const ep = endpointId ?? process.env["RUNPOD_IMAGE_ENDPOINT_ID"];
    if (!key) throw new Error("RUNPOD_API_KEY environment variable is required");
    if (!ep) throw new Error("RUNPOD_IMAGE_ENDPOINT_ID environment variable is required");
    this.apiKey = key;
    this.endpointId = ep;
  }

  async generate(prompt: string, style?: string, _referenceImage?: Buffer, aspectRatio?: string): Promise<Buffer> {
    const isLandscape = aspectRatio === "16:9";
    const { width, height } = isLandscape ? DIMENSIONS.landscape : DIMENSIONS.portrait;

    const orientationHint = isLandscape
      ? "WIDE HORIZONTAL LANDSCAPE image ONLY. 16:9 widescreen aspect ratio. CRITICAL: Do NOT generate portrait or vertical orientation."
      : "Vertical 9:16 portrait image.";

    const fullPrompt = isLandscape
      ? `${orientationHint} ${prompt}.${style ? ` Style: ${style}.` : ""} No text, no watermarks.`
      : style
        ? `${prompt}. Style: ${style}. ${orientationHint} No text, no watermarks.`
        : `${prompt}. ${orientationHint} No text, no watermarks.`;

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.runJob(fullPrompt, width, height);
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === 2) break;
        const delay = 3000 * Math.pow(2, attempt);
        console.warn(`[image/runpod] Attempt ${attempt + 1} failed (${err}), retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  private async runJob(prompt: string, width: number, height: number): Promise<Buffer> {
    const submitRes = await fetch(`${RUNPOD_BASE}/${this.endpointId}/run`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: {
          prompt,
          width,
          height,
          num_inference_steps: 28,
          guidance_scale: 3.5,
          num_images: 1,
        },
      }),
    });

    if (!submitRes.ok) {
      const errBody = await submitRes.text().catch(() => "");
      throw new Error(`RunPod image submit failed: ${submitRes.status} ${errBody}`);
    }

    const submit = (await submitRes.json()) as { id: string };
    const jobId = submit.id;
    if (!jobId) throw new Error(`RunPod image: no job id in response: ${JSON.stringify(submit)}`);

    console.log(`[image/runpod] Job ${jobId} submitted (${width}x${height})`);

    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${RUNPOD_BASE}/${this.endpointId}/status/${jobId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!pollRes.ok) {
        const errBody = await pollRes.text().catch(() => "");
        throw new Error(`RunPod image poll failed: ${pollRes.status} ${errBody}`);
      }

      const poll = (await pollRes.json()) as RunPodStatus;
      console.log(`[image/runpod] Job ${jobId} — status=${poll.status}`);

      if (poll.status === "COMPLETED") {
        const buffer = await extractImageBuffer(poll.output);
        if (!buffer) throw new Error(`RunPod image: completed but no image in output: ${JSON.stringify(poll.output)}`);
        return buffer;
      }

      if (poll.status === "FAILED" || poll.status === "CANCELLED") {
        throw new Error(`RunPod image job ${poll.status.toLowerCase()}: ${poll.error ?? "unknown error"}`);
      }
    }

    throw new Error(`RunPod image job ${jobId} timed out after ${TIMEOUT_MS / 1000}s`);
  }
}

async function extractImageBuffer(output: unknown): Promise<Buffer | null> {
  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;

  // Extract raw string value from common field names
  const raw: string | null =
    (Array.isArray(o["images"]) && typeof o["images"][0] === "string" ? o["images"][0] : null) ??
    (typeof o["image"] === "string" ? o["image"] : null) ??
    (typeof o["image_base64"] === "string" ? o["image_base64"] : null) ??
    (Array.isArray(o["output"]) && typeof o["output"][0] === "string" ? o["output"][0] : null) ??
    (typeof o["output"] === "string" ? o["output"] : null) ??
    null;

  if (!raw) return null;

  // URL → download
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const res = await fetch(raw);
    if (!res.ok) throw new Error(`RunPod image URL download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  // data URI → strip prefix
  const dataMatch = raw.match(/^data:image\/\w+;base64,(.+)$/);
  if (dataMatch) return Buffer.from(dataMatch[1], "base64");

  // plain base64
  return Buffer.from(raw, "base64");
}
