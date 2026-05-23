import type { ImageProvider } from "../../schema/providers.js";

// DashScope native image generation API (international region)
// Can be overridden via ALICLOUD_IMAGE_BASE_URL env var for on-prem/MaaS plans
const ALICLOUD_IMAGE_BASE_URL =
  process.env["ALICLOUD_IMAGE_BASE_URL"] ??
  "https://dashscope-intl.aliyuncs.com";

// Available image models on this plan:
//   Wanxiang: wan2.1-t2i-turbo (fast) | wan2.1-t2i-plus | wan2.7-image | wan2.7-image-pro
const DEFAULT_MODEL =
  process.env["ALICLOUD_IMAGE_MODEL"] ?? "wan2.1-t2i-turbo";

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1500;
const POLL_INTERVAL_MS = 4000;
const TIMEOUT_MS = 120_000; // 2 min

interface TaskResponse {
  output?: {
    task_id?: string;
    task_status?: string;
    results?: Array<{ url?: string; b64_image?: string }>;
    error_message?: string;
  };
  request_id?: string;
  code?: string;
  message?: string;
}

function isRetryable(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("503") ||
    msg.includes("429") ||
    msg.includes("rate_limit") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET")
  );
}

export class AliCloudImage implements ImageProvider {
  private apiKey: string;
  private model: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey ?? process.env["ALICLOUD_API_KEY"];
    if (!key) throw new Error("ALICLOUD_API_KEY environment variable is required");
    this.apiKey = key;
    this.model = model ?? DEFAULT_MODEL;
  }

  async generate(prompt: string, style?: string): Promise<Buffer> {
    const fullPrompt = style
      ? `${prompt}. Style: ${style}. Vertical portrait orientation, 9:16 aspect ratio. No text, no watermarks.`
      : `${prompt}. Vertical portrait orientation, 9:16 aspect ratio. No text, no watermarks.`;

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.generateOnce(fullPrompt);
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === MAX_RETRIES - 1) break;
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[image/alicloud] Attempt ${attempt + 1} failed (${err}), retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw lastError;
  }

  private async generateOnce(prompt: string): Promise<Buffer> {
    const submitRes = await fetch(
      `${ALICLOUD_IMAGE_BASE_URL}/api/v1/services/aigc/text2image/image-synthesis`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify({
          model: this.model,
          input: { prompt },
          parameters: { size: "768*1280", n: 1 },
        }),
      },
    );

    if (!submitRes.ok) {
      const body = await submitRes.text().catch(() => "");
      throw new Error(`AliCloud image submit failed: ${submitRes.status} ${body}`);
    }

    const submitData = (await submitRes.json()) as TaskResponse;
    const taskId = submitData.output?.task_id;
    if (!taskId) {
      throw new Error(`AliCloud image: no task_id in response: ${JSON.stringify(submitData)}`);
    }

    // Poll for result
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(`${ALICLOUD_IMAGE_BASE_URL}/api/v1/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });

      if (!pollRes.ok) {
        const body = await pollRes.text().catch(() => "");
        throw new Error(`AliCloud image poll failed: ${pollRes.status} ${body}`);
      }

      const pollData = (await pollRes.json()) as TaskResponse;
      const status = pollData.output?.task_status;

      if (status === "SUCCEEDED") {
        const result = pollData.output?.results?.[0];
        if (!result) throw new Error("AliCloud image: SUCCEEDED but no results");

        if (result.b64_image) {
          return Buffer.from(result.b64_image, "base64");
        }
        if (result.url) {
          const imgRes = await fetch(result.url);
          if (!imgRes.ok) throw new Error(`AliCloud image download failed: ${imgRes.status}`);
          return Buffer.from(await imgRes.arrayBuffer());
        }
        throw new Error("AliCloud image: no url or b64_image in result");
      }

      if (status === "FAILED") {
        throw new Error(`AliCloud image task failed: ${pollData.output?.error_message ?? "unknown"}`);
      }

      // PENDING or RUNNING — keep polling
    }

    throw new Error(`AliCloud image task timed out after ${TIMEOUT_MS / 1000}s (task: ${taskId})`);
  }
}
