import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { VideoProvider, VideoResult } from "../../schema/providers.js";

const VIVI_BASE_URL = "https://api.viviai.cc";
const DEFAULT_MODEL = "grok-video-3";
const TIMEOUT_MS = 300_000; // 5 min
const POLL_INTERVAL_MS = 6_000;

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type: string; video_url?: { url?: string }; text?: string }>;
    };
    finish_reason?: string;
  }>;
  error?: { message?: string };
}

export class ViviVideo implements VideoProvider {
  private apiKey: string;
  private model: string;

  readonly supportedDurations = [5, 6, 8, 10];

  constructor(model: string = DEFAULT_MODEL, apiKey?: string) {
    const key = apiKey ?? process.env["VIVI_VIDEO_API_KEY"] ?? process.env["VIVI_LLM_API_KEY"];
    if (!key) throw new Error("VIVI_VIDEO_API_KEY environment variable is required for VIVI video");
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
    const durationSeconds = opts.durationSeconds ?? 6;
    const b64Image = opts.sourceImage.toString("base64");

    const res = await fetch(`${VIVI_BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/png;base64,${b64Image}` } },
              { type: "text", text: opts.prompt },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`VIVI video request failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as ChatResponse;

    if (data.error?.message) {
      throw new Error(`VIVI video error: ${data.error.message}`);
    }

    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("VIVI video: no content in response");

    const videoUrl = this.extractVideoUrl(content);
    if (!videoUrl) {
      const preview = typeof content === "string" ? content.slice(0, 300) : JSON.stringify(content).slice(0, 300);
      throw new Error(`VIVI video: no video URL found in response: ${preview}`);
    }

    // Download to temp file
    const tmpPath = path.join(os.tmpdir(), `openreels-vivi-${Date.now()}.mp4`);
    const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!videoRes.ok) throw new Error(`VIVI video download failed: ${videoRes.status}`);
    await fsp.writeFile(tmpPath, Buffer.from(await videoRes.arrayBuffer()));

    const stat = await fsp.stat(tmpPath);
    if (stat.size === 0) throw new Error("VIVI video download produced empty file");

    return { filePath: tmpPath, durationSeconds };
  }

  private extractVideoUrl(
    content: string | Array<{ type: string; video_url?: { url?: string }; text?: string }>,
  ): string | null {
    if (typeof content === "string") {
      if (content.startsWith("http")) return content.trim();
      try {
        const parsed = JSON.parse(content) as unknown;
        if (Array.isArray(parsed)) return this.extractVideoUrl(parsed as Array<{ type: string; video_url?: { url?: string } }>);
      } catch {}
      // Try to find a URL inside the text
      const match = content.match(/https?:\/\/\S+\.mp4\S*/i);
      return match?.[0] ?? null;
    }
    for (const block of content) {
      if (block.video_url?.url) return block.video_url.url;
      if (block.type === "text" && block.text?.startsWith("http")) return block.text.trim();
    }
    return null;
  }
}
