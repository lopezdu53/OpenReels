const URL_RE = /https?:\/\/[^\s"'<>\\]+/gi;
const DATA_RE = /data:(image|video)\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;

export function collectStrings(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 12 || value == null) return out;
  if (typeof value === "string") {
    out.push(value);
    return out;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (["url", "uri", "href", "src", "image_url", "video_url", "file_url", "cdn"].includes(key) && typeof nested === "string") {
        out.push(nested);
      }
      collectStrings(nested, out, depth + 1);
    }
  }
  return out;
}

export function extractMediaUrls(payload: unknown): { images: string[]; videos: string[]; dataUris: string[] } {
  const blobs = collectStrings(payload);
  const images: string[] = [];
  const videos: string[] = [];
  const dataUris: string[] = [];
  for (const blob of blobs) {
    const dataHits = blob.match(DATA_RE) ?? [];
    for (const hit of dataHits) dataUris.push(hit);
    const urlHits = blob.match(URL_RE) ?? [];
    for (const raw of urlHits) {
      const url = raw.replace(/[),.;]+$/, "");
      const low = url.toLowerCase();
      if (/\.(mp4|webm|mov)(\?|$)/.test(low) || low.includes("/video")) videos.push(url);
      else if (/\.(png|jpe?g|webp|gif)(\?|$)/.test(low) || low.includes("/image") || low.includes("lh3.google")) {
        images.push(url);
      } else if (low.startsWith("http")) {
        images.push(url);
      }
    }
  }
  return {
    images: [...new Set(images)],
    videos: [...new Set(videos)],
    dataUris: [...new Set(dataUris)],
  };
}

export function dataUriToBuffer(uri: string): Buffer | null {
  const m = uri.match(/^data:([^;]+);base64,(.+)$/s);
  if (!m) return null;
  try {
    return Buffer.from(m[2]!, "base64");
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/** MCP `content: [{ type: "image", data, mimeType }]` — Toby often omits http URLs. */
export function extractMcpBuffers(payload: unknown, kind: "image" | "video"): Buffer[] {
  const out: Buffer[] = [];
  const walk = (value: unknown, depth: number): void => {
    if (depth > 12 || value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    const rec = asRecord(value);
    if (!rec) return;
    const type = String(rec.type ?? rec.kind ?? "").toLowerCase();
    const mime = String(rec.mimeType ?? rec.mime ?? rec.media_type ?? "").toLowerCase();
    const raw = rec.data ?? rec.blob ?? rec.b64 ?? rec.bytes;
    const wantsImage = kind === "image" && (type === "image" || mime.startsWith("image/"));
    const wantsVideo = kind === "video" && (type === "video" || mime.startsWith("video/"));
    if ((wantsImage || wantsVideo) && typeof raw === "string" && raw.length > 80) {
      const trimmed = raw.includes(",") && raw.startsWith("data:") ? raw.slice(raw.indexOf(",") + 1) : raw;
      try {
        const buf = Buffer.from(trimmed, "base64");
        const min = kind === "video" ? 8_000 : 800;
        if (buf.length >= min) out.push(buf);
      } catch {
        /* ignore */
      }
    }
    for (const nested of Object.values(rec)) walk(nested, depth + 1);
  };
  walk(payload, 0);
  return out;
}
