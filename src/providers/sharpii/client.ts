export const SHARPII_BASE_URL = "https://api.sharpii.ai/v1";

export interface SharpiiOutput {
  type?: string;
  url?: string;
  width?: number;
  height?: number;
  duration_seconds?: number;
}

export function toDataUri(image: Buffer, mime = "image/png"): string {
  return `data:${mime};base64,${image.toString("base64")}`;
}

function errorMessage(status: number, json: unknown): string {
  const row = json as { error?: { message?: string; code?: string }; message?: string };
  const msg = row?.error?.message ?? row?.message ?? JSON.stringify(json).slice(0, 240);
  const code = row?.error?.code;
  return `Sharpii ${status}${code ? ` ${code}` : ""}: ${msg}`;
}

async function parseJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text.slice(0, 240) };
  }
}

export async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sharpii download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 80) throw new Error("Sharpii download was empty");
  return buf;
}

export async function pollSharpiiTask(
  apiKey: string,
  taskId: string,
  timeoutMs = 8 * 60_000,
): Promise<SharpiiOutput[]> {
  const started = Date.now();
  let delay = 3_000;
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, delay));
    const elapsed = Date.now() - started;
    delay = elapsed < 30_000 ? 3_000 : elapsed < 5 * 60_000 ? 10_000 : 30_000;

    const res = await fetch(`${SHARPII_BASE_URL}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const json = (await parseJson(res)) as {
      data?: { status?: string; outputs?: SharpiiOutput[]; error?: { message?: string } };
    };
    if (!res.ok) throw new Error(errorMessage(res.status, json));
    const status = json.data?.status;
    if (status === "completed") {
      const outputs = json.data?.outputs ?? [];
      if (!outputs.length) throw new Error("Sharpii task completed with no outputs");
      return outputs;
    }
    if (status === "failed") {
      throw new Error(json.data?.error?.message ?? "Sharpii task failed");
    }
  }
  throw new Error(`Sharpii task ${taskId} timed out`);
}

export async function sharpiiGenerate(
  apiKey: string,
  path: "/images/generate" | "/videos/generate",
  body: Record<string, unknown>,
): Promise<SharpiiOutput[]> {
  const res = await fetch(`${SHARPII_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await parseJson(res)) as {
    data?: { outputs?: SharpiiOutput[]; task?: { id?: string }; id?: string };
    task?: { id?: string };
    error?: { message?: string };
  };

  if (res.status === 202) {
    const taskId = json.data?.task?.id ?? json.task?.id ?? json.data?.id;
    if (!taskId) throw new Error("Sharpii returned 202 without a task id");
    return pollSharpiiTask(apiKey, taskId);
  }
  if (!res.ok) throw new Error(errorMessage(res.status, json));
  const outputs = json.data?.outputs ?? [];
  if (!outputs.length) throw new Error("Sharpii returned no outputs");
  return outputs;
}
