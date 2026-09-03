const RUNPOD_BASE = "https://api.runpod.ai/v2";

export interface RunPodStatus {
  id: string;
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
  output?: unknown;
  error?: string;
}

export function isRunPodRetryable(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET")
  );
}

export async function runPodJob(opts: {
  endpointId: string;
  apiKey: string;
  input: Record<string, unknown>;
  pollMs: number;
  timeoutMs: number;
  logPrefix: string;
}): Promise<unknown> {
  const submitRes = await fetch(`${RUNPOD_BASE}/${opts.endpointId}/run`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: opts.input }),
  });

  if (!submitRes.ok) {
    const errBody = await submitRes.text().catch(() => "");
    throw new Error(`RunPod submit failed: ${submitRes.status} ${errBody}`);
  }

  const submit = (await submitRes.json()) as { id?: string; status?: string; output?: unknown };
  // /runsync-style responses (rare) may complete inline
  if (submit.status === "COMPLETED" && submit.output != null) return submit.output;

  const jobId = submit.id;
  if (!jobId) throw new Error(`RunPod: no job id in response: ${JSON.stringify(submit)}`);

  console.log(`[${opts.logPrefix}] Job ${jobId} submitted (${opts.endpointId})`);

  const deadline = Date.now() + opts.timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, opts.pollMs));

    const pollRes = await fetch(`${RUNPOD_BASE}/${opts.endpointId}/status/${jobId}`, {
      headers: { Authorization: `Bearer ${opts.apiKey}` },
    });

    if (!pollRes.ok) {
      const errBody = await pollRes.text().catch(() => "");
      throw new Error(`RunPod poll failed: ${pollRes.status} ${errBody}`);
    }

    const poll = (await pollRes.json()) as RunPodStatus;
    console.log(`[${opts.logPrefix}] Job ${jobId} — status=${poll.status}`);

    if (poll.status === "COMPLETED") return poll.output;
    if (poll.status === "FAILED" || poll.status === "CANCELLED") {
      throw new Error(`RunPod job ${poll.status.toLowerCase()}: ${poll.error ?? "unknown error"}`);
    }
  }

  throw new Error(`RunPod job ${jobId} timed out after ${opts.timeoutMs / 1000}s`);
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.length > 0) return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  }
  return null;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

async function downloadMedia(url: string, kind: "image" | "video"): Promise<Buffer> {
  const res = await fetch(url.trim());
  if (!res.ok) throw new Error(`RunPod ${kind} URL download failed: ${res.status}`);
  return Buffer.from(new Uint8Array(await res.arrayBuffer()));
}

const remoteUrls = new WeakMap<Buffer, string>();

/** Remember a hosted HTTPS URL for a downloaded RunPod buffer (scene-safe). */
export function rememberRemoteUrl(buffer: Buffer, url: string | undefined): Buffer {
  if (url && isHttpUrl(url)) remoteUrls.set(buffer, url.trim());
  return buffer;
}

export function lookupRemoteUrl(buffer: Buffer): string | undefined {
  return remoteUrls.get(buffer);
}

/**
 * WaveSpeed-backed public endpoints often return `{ cost, result: "https://..." }`
 * instead of the documented `image_url` / `video_url` keys.
 */
export function mediaUrlFrom(output: unknown, kind: "image" | "video"): string | null {
  if (typeof output === "string" && isHttpUrl(output)) return output.trim();
  if (!output || typeof output !== "object") return null;

  const o = output as Record<string, unknown>;
  const nested =
    o["output"] && typeof o["output"] === "object" ? (o["output"] as Record<string, unknown>) : o;

  const candidate = firstString(
    nested["image_url"],
    nested["video_url"],
    nested["url"],
    nested["result"],
    nested["image"],
    nested["video"],
    nested["output"],
    kind === "image" ? nested["images"] : nested["videos"],
    o["result"],
    o["image_url"],
    o["video_url"],
  );
  return candidate && isHttpUrl(candidate) ? candidate.trim() : null;
}

export async function extractMediaBuffer(output: unknown, kind: "image" | "video"): Promise<Buffer | null> {
  const url = mediaUrlFrom(output, kind);
  if (url) {
    const buffer = await downloadMedia(url, kind);
    return rememberRemoteUrl(buffer, url);
  }

  if (!output || typeof output !== "object") return null;
  const o = output as Record<string, unknown>;
  const nested = o["output"] && typeof o["output"] === "object" ? (o["output"] as Record<string, unknown>) : o;

  const raw = firstString(
    nested["image"],
    nested["image_base64"],
    nested["video"],
    nested["video_base64"],
    nested["output"],
    nested["result"],
    nested["images"],
  );
  if (!raw) return null;

  if (isHttpUrl(raw)) {
    const buffer = await downloadMedia(raw, kind);
    return rememberRemoteUrl(buffer, raw);
  }

  const dataMatch = raw.match(/^data:(?:image|video)\/[\w+.-]+;base64,(.+)$/);
  if (dataMatch) return Buffer.from(dataMatch[1] ?? "", "base64");

  return Buffer.from(raw, "base64");
}
