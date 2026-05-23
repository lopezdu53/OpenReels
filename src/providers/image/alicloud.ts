import type { ImageProvider } from "../../schema/providers.js";

// Image generation uses the same compatible-mode chat completions endpoint as LLM.
// The MaaS plan key only works with this endpoint, not dashscope-intl.aliyuncs.com.
const ALICLOUD_BASE_URL =
  process.env["ALICLOUD_BASE_URL"] ??
  "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1";

// Available image generation models on this plan:
//   qwen-image-2.0 (default) | qwen-image-2.0-pro | wan2.7-image | wan2.7-image-pro
const DEFAULT_MODEL =
  process.env["ALICLOUD_IMAGE_MODEL"] ?? "qwen-image-2.0";

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1500;

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type: string; image_url?: { url?: string }; text?: string }>;
    };
  }>;
  error?: { message?: string };
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
  private baseUrl: string;

  constructor(model?: string, apiKey?: string) {
    const key = apiKey ?? process.env["ALICLOUD_API_KEY"];
    if (!key) throw new Error("ALICLOUD_API_KEY environment variable is required");
    this.apiKey = key;
    this.model = model ?? DEFAULT_MODEL;
    this.baseUrl = ALICLOUD_BASE_URL;
  }

  async generate(prompt: string, style?: string): Promise<Buffer> {
    const fullPrompt = style
      ? `Generate an image: ${prompt}. Style: ${style}. Vertical portrait orientation, 9:16 aspect ratio. No text, no watermarks.`
      : `Generate an image: ${prompt}. Vertical portrait orientation, 9:16 aspect ratio. No text, no watermarks.`;

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
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        // qwen-image-2.0 requires content as an array of content blocks
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AliCloud image chat failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as ChatResponse;

    if (data.error?.message) {
      throw new Error(`AliCloud image error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("AliCloud image: no content in response");
    }

    // Content can be a string (URL or base64) or an array of content blocks
    const imageUrl = this.extractImageUrl(content);
    if (!imageUrl) {
      const preview = typeof content === "string" ? content.slice(0, 200) : JSON.stringify(content).slice(0, 200);
      throw new Error(`AliCloud image: could not find image URL in response: ${preview}`);
    }

    // data URI (base64)
    if (imageUrl.startsWith("data:")) {
      const b64 = imageUrl.split(",")[1];
      if (!b64) throw new Error("AliCloud image: malformed data URI");
      return Buffer.from(b64, "base64");
    }

    // Remote URL — download it
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`AliCloud image download failed: ${imgRes.status}`);
    return Buffer.from(await imgRes.arrayBuffer());
  }

  private extractImageUrl(
    content: string | Array<{ type: string; image_url?: { url?: string }; text?: string }>,
  ): string | null {
    if (typeof content === "string") {
      // Plain URL
      if (content.startsWith("http") || content.startsWith("data:")) return content.trim();
      // Might be JSON-encoded array inside a string
      try {
        const parsed = JSON.parse(content) as unknown;
        if (Array.isArray(parsed)) return this.extractImageUrl(parsed as Array<{ type: string; image_url?: { url?: string } }>);
      } catch {}
      return null;
    }

    for (const block of content) {
      if (block.type === "image_url" && block.image_url?.url) return block.image_url.url;
      if (block.type === "image" && block.image_url?.url) return block.image_url.url;
      // Some providers embed the URL directly in text block
      if (block.type === "text" && block.text) {
        if (block.text.startsWith("http") || block.text.startsWith("data:")) return block.text.trim();
      }
    }
    return null;
  }
}
