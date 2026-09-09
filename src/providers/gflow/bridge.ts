import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GflowCliError } from "./errors.js";
import { enqueueGflow } from "./queue.js";

export function gflowBridgeUrl(): string | undefined {
  const raw = process.env["GFLOW_BRIDGE_URL"]?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/$/, "");
}

export function gflowBridgeToken(): string | undefined {
  const raw = process.env["GFLOW_BRIDGE_TOKEN"]?.trim();
  return raw || undefined;
}

async function bridgeFetch(pathname: string, init?: RequestInit, timeoutMs = 30_000): Promise<Response> {
  const base = gflowBridgeUrl();
  if (!base) throw new GflowCliError("Falta GFLOW_BRIDGE_URL (IP LAN del Windows, ej. http://192.168.1.50:8787)");
  const token = gflowBridgeToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(`${base}${pathname}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new GflowCliError(
      `No se alcanzó el puente Windows (${base}): ${msg}. ¿Está start.bat corriendo y el firewall solo deja pasar al Xeon?`,
      1,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}

async function readBridgeJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new GflowCliError(`Puente gflow: respuesta no JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok || payload["ok"] === false) {
    throw new GflowCliError(String(payload["error"] ?? `puente HTTP ${res.status}`), res.status, res.status === 429 || res.status >= 500);
  }
  return payload;
}

export async function bridgeHealth(): Promise<{ ok: boolean; detail: string }> {
  if (!gflowBridgeUrl()) {
    return { ok: false, detail: "GFLOW_BRIDGE_URL no está en el worker" };
  }
  try {
    const res = await bridgeFetch("/v1/health", { method: "GET" }, 8_000);
    const payload = await readBridgeJson(res);
    const busy = payload["busy"] === true ? " · ocupado" : "";
    return { ok: true, detail: `windows${busy}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

export async function bridgeGenerateImage(opts: {
  prompt: string;
  style?: string;
  aspect: string;
  model: string;
  referencePng?: Buffer;
}): Promise<Buffer> {
  return enqueueGflow(() => bridgeGenerateImageNow(opts));
}

async function bridgeGenerateImageNow(opts: {
  prompt: string;
  style?: string;
  aspect: string;
  model: string;
  referencePng?: Buffer;
}): Promise<Buffer> {
  const res = await bridgeFetch(
    "/v1/image",
    {
      method: "POST",
      body: JSON.stringify({
        prompt: opts.prompt,
        style: opts.style,
        aspect: opts.aspect,
        model: opts.model,
        ...(opts.referencePng && opts.referencePng.length > 80
          ? { referencePng: opts.referencePng.toString("base64") }
          : {}),
      }),
    },
    270_000,
  );
  const payload = await readBridgeJson(res);
  const b64 = payload["png"];
  if (typeof b64 !== "string") throw new GflowCliError("Puente gflow: falta png");
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 1000) throw new GflowCliError(`Puente gflow: imagen demasiado pequeña (${buf.length})`);
  return buf;
}

export async function bridgeGenerateVideo(opts: {
  prompt: string;
  aspect: string;
  model: string;
  durationSeconds: number;
  mode?: "t2v" | "i2v";
  imagePng?: Buffer;
}): Promise<{ filePath: string; durationSeconds: number }> {
  return enqueueGflow(() => bridgeGenerateVideoNow(opts));
}

async function bridgeGenerateVideoNow(opts: {
  prompt: string;
  aspect: string;
  model: string;
  durationSeconds: number;
  mode?: "t2v" | "i2v";
  imagePng?: Buffer;
}): Promise<{ filePath: string; durationSeconds: number }> {
  const mode = opts.mode === "i2v" ? "i2v" : "t2v";
  const res = await bridgeFetch(
    "/v1/video",
    {
      method: "POST",
      body: JSON.stringify({
        prompt: opts.prompt,
        aspect: opts.aspect,
        model: opts.model,
        durationSeconds: opts.durationSeconds,
        mode,
        ...(mode === "i2v" && opts.imagePng && opts.imagePng.length > 80
          ? { imagePng: opts.imagePng.toString("base64") }
          : {}),
      }),
    },
    520_000,
  );
  const payload = await readBridgeJson(res);
  const b64 = payload["mp4"];
  if (typeof b64 !== "string") throw new GflowCliError("Puente gflow: falta mp4");
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 20_000) throw new GflowCliError(`Puente gflow: video demasiado pequeño (${buf.length})`);
  const dest = path.join(os.tmpdir(), `openreels-gflow-bridge-${Date.now()}.mp4`);
  fs.writeFileSync(dest, buf);
  const duration =
    typeof payload["durationSeconds"] === "number" ? payload["durationSeconds"] : opts.durationSeconds;
  return { filePath: dest, durationSeconds: duration };
}
