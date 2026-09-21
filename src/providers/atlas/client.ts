import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { ATLAS_MEDIA_BASE, ATLAS_USER_AGENT } from "./catalog.js";

export const ATLAS_INVALID_KEY_MESSAGE =
  "Atlas: API key inválida. En EasyPanel el VALOR debe ser solo la clave completa " +
  "(empieza por apikey-), no ATLASCLOUD_API_KEY=.... Cópiala de " +
  "https://www.atlascloud.ai/console/api-keys y vuelve a Implementar video y video-worker.";

export function rewriteAtlasAuthError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (/invalid.*api.?key|unauthorized|api key is invalid|incorrect api key|401/i.test(msg)) {
    return new AtlasCloudError(ATLAS_INVALID_KEY_MESSAGE);
  }
  return err instanceof Error ? err : new Error(String(err));
}

export class AtlasCloudError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtlasCloudError";
  }
}

const KEY_NAME_PREFIX = /^ATLASCLOUD_API_KEY\s*=\s*/i;

/** Strip quotes, whitespace, and accidental `ATLASCLOUD_API_KEY=` pasted into the value. */
export function sanitizeAtlasApiKey(raw?: string | null): string | undefined {
  if (raw == null) return undefined;
  let key = String(raw).trim();
  if (!key) return undefined;
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  if (KEY_NAME_PREFIX.test(key)) {
    key = key.replace(KEY_NAME_PREFIX, "").trim();
    if (
      (key.startsWith('"') && key.endsWith('"')) ||
      (key.startsWith("'") && key.endsWith("'"))
    ) {
      key = key.slice(1, -1).trim();
    }
  }
  return key || undefined;
}

/** First usable candidate, then env. Empty / NAME=value leftovers do not win over env. */
export function resolveAtlasApiKey(...candidates: Array<string | undefined | null>): string | undefined {
  for (const candidate of candidates) {
    const cleaned = sanitizeAtlasApiKey(candidate);
    if (cleaned) return cleaned;
  }
  return sanitizeAtlasApiKey(process.env["ATLASCLOUD_API_KEY"]);
}

export function requireAtlasApiKey(
  purpose: string,
  ...candidates: Array<string | undefined | null>
): string {
  const key = resolveAtlasApiKey(...candidates);
  if (!key) {
    throw new Error(`ATLASCLOUD_API_KEY environment variable is required for Atlas ${purpose}`);
  }
  return key;
}

export function atlasHeaders(apiKey: string, jsonBody = true): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": ATLAS_USER_AGENT,
  };
  if (jsonBody) headers["Content-Type"] = "application/json";
  return headers;
}

export function toDataUri(buf: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text.slice(0, 400) };
  }
}

function errorText(status: number, pathName: string, json: unknown): string {
  const row = json as { message?: string; error?: string | { message?: string }; data?: { message?: string } };
  const msg =
    (typeof row.error === "object" ? row.error?.message : row.error) ??
    row.message ??
    row.data?.message ??
    JSON.stringify(json).slice(0, 300);
  const text = String(msg ?? "");
  if (status === 401 || /invalid.*api.?key|unauthorized|api key is invalid/i.test(text)) {
    return ATLAS_INVALID_KEY_MESSAGE;
  }
  return `Atlas ${status} ${pathName}: ${msg}`;
}

export async function atlasPost(
  apiKey: string,
  pathName: string,
  body: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${ATLAS_MEDIA_BASE}${pathName}`, {
    method: "POST",
    headers: atlasHeaders(apiKey),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await parseJson(res)) as Record<string, unknown>;
  if (!res.ok) throw new AtlasCloudError(errorText(res.status, pathName, json));
  return json;
}

export async function atlasGet(
  apiKey: string,
  pathName: string,
  timeoutMs = 30_000,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${ATLAS_MEDIA_BASE}${pathName}`, {
    headers: atlasHeaders(apiKey, false),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = (await parseJson(res)) as Record<string, unknown>;
  // Failed predictions can return HTTP 4xx/5xx with a normal envelope.
  if (!res.ok && !json.data && !json.status) {
    throw new AtlasCloudError(errorText(res.status, pathName, json));
  }
  return json;
}

export function predictionId(json: Record<string, unknown>): string {
  const data = json.data as { id?: string } | undefined;
  const id = data?.id ?? (json.id as string | undefined);
  if (!id) throw new AtlasCloudError(`Atlas submit returned no prediction id: ${JSON.stringify(json).slice(0, 240)}`);
  return id;
}

export async function pollPrediction(
  apiKey: string,
  id: string,
  opts?: { intervalMs?: number; timeoutMs?: number },
): Promise<string> {
  const interval = opts?.intervalMs ?? 3_000;
  const timeout = opts?.timeoutMs ?? 900_000;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    const json = await atlasGet(apiKey, `/model/prediction/${id}`);
    const data = (json.data ?? json) as {
      status?: string;
      outputs?: unknown;
      output?: unknown;
      message?: string;
      error_code?: string;
    };
    const status = data.status ?? "?";
    if (status === "completed" || status === "succeeded") {
      const out = data.outputs ?? data.output;
      const first = Array.isArray(out) ? out[0] : out;
      if (typeof first === "string" && first.length > 0) return first;
      if (first && typeof first === "object" && "url" in first) {
        const url = (first as { url?: string }).url;
        if (url) return url;
      }
      throw new AtlasCloudError(`Atlas ${id}: completed but no output URL`);
    }
    if (status === "failed") {
      throw new AtlasCloudError(`Atlas ${id} failed: ${data.message ?? data.error_code ?? JSON.stringify(data).slice(0, 240)}`);
    }
  }
  throw new AtlasCloudError(`Atlas ${id} timed out after ${timeout / 1000}s`);
}

export async function submitImage(
  apiKey: string,
  model: string,
  prompt: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const json = await atlasPost(apiKey, "/model/generateImage", { model, prompt, ...extra });
  return predictionId(json);
}

export async function submitVideo(
  apiKey: string,
  model: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const json = await atlasPost(apiKey, "/model/generateVideo", { model, ...extra });
  return predictionId(json);
}

export async function submitAudio(
  apiKey: string,
  model: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  const json = await atlasPost(apiKey, "/model/generateAudio", { model, ...extra });
  return predictionId(json);
}

export async function generateImage(
  apiKey: string,
  model: string,
  prompt: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  return pollPrediction(apiKey, await submitImage(apiKey, model, prompt, extra), {
    intervalMs: 3_000,
    timeoutMs: 180_000,
  });
}

export async function generateVideo(
  apiKey: string,
  model: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  return pollPrediction(apiKey, await submitVideo(apiKey, model, extra), {
    intervalMs: 4_000,
    timeoutMs: 900_000,
  });
}

export async function generateAudio(
  apiKey: string,
  model: string,
  extra: Record<string, unknown> = {},
): Promise<string> {
  return pollPrediction(apiKey, await submitAudio(apiKey, model, extra), {
    intervalMs: 2_000,
    timeoutMs: 180_000,
  });
}

export async function uploadMedia(apiKey: string, filePath: string): Promise<string> {
  const bytes = await fsp.readFile(filePath);
  const name = path.basename(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes]), name);
  const res = await fetch(`${ATLAS_MEDIA_BASE}/model/uploadMedia`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "User-Agent": ATLAS_USER_AGENT,
    },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await parseJson(res)) as {
    data?: { download_url?: string; url?: string };
    download_url?: string;
    url?: string;
  };
  if (!res.ok) throw new AtlasCloudError(errorText(res.status, "/model/uploadMedia", json));
  const url = json.data?.download_url ?? json.data?.url ?? json.download_url ?? json.url;
  if (!url) throw new AtlasCloudError(`Atlas upload returned no URL: ${JSON.stringify(json).slice(0, 240)}`);
  return url;
}

export async function uploadBuffer(
  apiKey: string,
  buf: Buffer,
  filename: string,
): Promise<string> {
  const tmp = path.join(os.tmpdir(), `openreels-atlas-${Date.now()}-${filename}`);
  await fsp.writeFile(tmp, buf);
  try {
    return await uploadMedia(apiKey, tmp);
  } finally {
    await fsp.unlink(tmp).catch(() => {});
  }
}

export async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { "User-Agent": ATLAS_USER_AGENT },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new AtlasCloudError(`Atlas download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 32) throw new AtlasCloudError("Atlas download was empty");
  return buf;
}
