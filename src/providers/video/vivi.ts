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
    console.log(`[video/vivi] Raw content from API: ${typeof content === "string" ? content.slice(0, 300) : JSON.stringify(content).slice(0, 300)}`);
    console.log(`[video/vivi] Extracted video URL: ${videoUrl ?? "null"}`);
    if (!videoUrl) {
      const preview = typeof content === "string" ? content.slice(0, 300) : JSON.stringify(content).slice(0, 300);
      throw new Error(`VIVI video: no video URL found in response: ${preview}`);
    }

    // Download to temp file
    const tmpPath = path.join(os.tmpdir(), `openreels-vivi-${Date.now()}.mp4`);
    const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!videoRes.ok) throw new Error(`VIVI video download failed: ${videoRes.status}`);

    // Reject non-video content types early (HTML error pages, JSON, etc.)
    const contentType = videoRes.headers.get("content-type") ?? "";
    console.log(`[video/vivi] Downloading from: ${videoUrl.slice(0, 120)} — content-type: ${contentType}`);
    if (contentType && !contentType.includes("video") && !contentType.includes("octet-stream")) {
      const body = await videoRes.text();
      // HTML viewer page — try to extract the real video URL from it
      if (contentType.includes("text/html")) {
        console.log(`[video/vivi] HTML viewer page received. Snippet: ${body.slice(0, 600)}`);
        const realUrl = this.extractVideoUrlFromHtml(body);
        console.log(`[video/vivi] Extracted real URL: ${realUrl ?? "none found"}`);
        if (realUrl) {
          const directRes = await fetch(realUrl, { signal: AbortSignal.timeout(TIMEOUT_MS) });
          if (!directRes.ok) throw new Error(`VIVI video direct download failed: ${directRes.status}`);
          const directType = directRes.headers.get("content-type") ?? "";
          if (directType && !directType.includes("video") && !directType.includes("octet-stream")) {
            const directBody = await directRes.text();
            throw new Error(`VIVI video: direct URL also returned non-video content: ${directType}: ${directBody.slice(0, 200)}`);
          }
          const buffer2 = Buffer.from(await directRes.arrayBuffer());
          if (buffer2.length < 50_000) throw new Error(`VIVI video direct download too small (${buffer2.length} bytes)`);
          await fsp.writeFile(tmpPath, buffer2);
          return { filePath: tmpPath, durationSeconds };
        }
      }
      throw new Error(`VIVI video: unexpected content-type "${contentType}": ${body.slice(0, 200)}`);
    }

    const buffer = Buffer.from(await videoRes.arrayBuffer());
    if (buffer.length < 50_000) {
      throw new Error(`VIVI video download too small (${buffer.length} bytes) — likely corrupt or error response`);
    }
    await fsp.writeFile(tmpPath, buffer);

    return { filePath: tmpPath, durationSeconds };
  }

  private extractVideoUrlFromHtml(html: string): string | null {
    // <video src="..."> or <source src="...">
    const srcMatch = html.match(/<(?:video|source)[^>]+src=["']([^"']+)["']/i);
    if (srcMatch?.[1] && srcMatch[1]!.startsWith("http")) return srcMatch[1]!;
    // og:video meta tag
    const ogMatch = html.match(/<meta[^>]+property=["']og:video(?::url)?["'][^>]+content=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video["']/i);
    if (ogMatch?.[1]) return ogMatch[1]!;
    // JSON initial state blobs: __NUXT__, __NEXT_DATA__, window.__INIT__, __APP_DATA__ etc.
    // Look for any video/mp4/m3u8/webm URL in JSON-like strings
    const jsonVideoMatch = html.match(/"(?:videoUrl|video_url|videoSrc|video_src|playUrl|play_url|mp4Url|mp4_url|fileUrl|file_url|downloadUrl|download_url|src|url)"\s*:\s*"(https?:\/\/[^"]+\.(?:mp4|m3u8|webm)[^"]*)"/i);
    if (jsonVideoMatch?.[1]) return jsonVideoMatch[1]!.replace(/\\\//g, "/");
    // JS variable assignment: videoUrl = "...", var src = "..."
    const jsAssignMatch = html.match(/(?:videoUrl|video_url|videoSrc|video_src|playUrl|play_url)\s*=\s*["'](https?:\/\/[^"']+\.(?:mp4|m3u8|webm)[^"']*)["']/i);
    if (jsAssignMatch?.[1]) return jsAssignMatch[1]!;
    // Any https URL ending in .mp4/.m3u8/.webm in the HTML (strict extension match)
    const mp4Match = html.match(/https?:\/\/[^\s"'<>\\]+\.(?:mp4|m3u8|webm)(?:[?#][^\s"'<>\\]*)?/i);
    if (mp4Match?.[0]) return mp4Match[0]!;
    return null;
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
