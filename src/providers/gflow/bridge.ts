import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GflowCliError, isGflowBridgeUnreachable } from "./errors.js";
import { enqueueGflow } from "./queue.js";
import {
  enqueueBridgeJob,
  gflowRelayEnabled,
  isBridgeOnline,
  waitForBridgeResult,
  type GflowRelayResult,
} from "./relay.js";

export function gflowBridgeUrl(): string | undefined {
  const raw = process.env["GFLOW_BRIDGE_URL"]?.trim();
  if (!raw) return undefined;
  return raw.replace(/\/$/, "");
}

export function gflowBridgeToken(): string | undefined {
  const raw = process.env["GFLOW_BRIDGE_TOKEN"]?.trim();
  return raw || undefined;
}

let lanDownUntil = 0;

export function rememberLanDown(ms = 45_000): void {
  lanDownUntil = Date.now() + ms;
}

export function lanIsCachedDown(): boolean {
  return Date.now() < lanDownUntil;
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
      `No se alcanzó el puente Windows (${base}): ${msg}. ¿Está OpenReels Puente abierto y el firewall deja pasar al Xeon?`,
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

async function lanHealthOk(): Promise<boolean> {
  if (!gflowBridgeUrl() || lanIsCachedDown()) return false;
  try {
    const res = await bridgeFetch("/v1/health", { method: "GET" }, 4_000);
    await readBridgeJson(res);
    return true;
  } catch {
    rememberLanDown();
    return false;
  }
}

async function preferLan(): Promise<boolean> {
  if (!gflowBridgeUrl()) return false;
  return lanHealthOk();
}

export async function bridgeHealth(): Promise<{ ok: boolean; detail: string }> {
  const lan = gflowBridgeUrl();
  if (lan) {
    try {
      const res = await bridgeFetch("/v1/health", { method: "GET" }, 8_000);
      const payload = await readBridgeJson(res);
      const busy = payload["busy"] === true ? " · ocupado" : "";
      return { ok: true, detail: `windows-lan${busy}` };
    } catch (err) {
      rememberLanDown();
      if (!gflowRelayEnabled()) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  if (gflowRelayEnabled()) {
    const online = await isBridgeOnline().catch(() => false);
    if (online) return { ok: true, detail: "windows-remoto" };
    if (!lan) {
      return {
        ok: false,
        detail: "Ningún Windows remoto conectado. Abre OpenReels Puente en modo Remoto (o Ambos).",
      };
    }
    return {
      ok: false,
      detail: `LAN ${lan} caído y ningún Windows remoto. Abre OpenReels Puente en el PC con Chrome.`,
    };
  }
  if (!lan) return { ok: false, detail: "GFLOW_BRIDGE_URL no está en el worker" };
  return { ok: false, detail: "No se alcanzó el puente Windows" };
}

async function viaRelay(
  kind: "image" | "video",
  body: Record<string, unknown>,
  timeoutSec: number,
): Promise<GflowRelayResult> {
  if (!(await isBridgeOnline())) {
    throw new GflowCliError(
      "Ningún Windows remoto conectado. En el PC con Chrome abre OpenReels Puente → modo Remoto, pega la URL del estudio y el mismo token.",
      1,
      true,
    );
  }
  const id = await enqueueBridgeJob(kind, body);
  return waitForBridgeResult(id, timeoutSec);
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
  const body = {
    prompt: opts.prompt,
    style: opts.style,
    aspect: opts.aspect,
    model: opts.model,
    ...(opts.referencePng && opts.referencePng.length > 80
      ? { referencePng: opts.referencePng.toString("base64") }
      : {}),
  };
  if (await preferLan()) {
    try {
      const res = await bridgeFetch(
        "/v1/image",
        { method: "POST", body: JSON.stringify(body) },
        270_000,
      );
      const payload = await readBridgeJson(res);
      return decodePng(payload["png"]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!gflowRelayEnabled() || !isGflowBridgeUnreachable(msg)) throw err;
      rememberLanDown();
    }
  } else if (gflowBridgeUrl() && !gflowRelayEnabled()) {
    throw new GflowCliError(
      `No se alcanzó el puente Windows (${gflowBridgeUrl()}). ¿Está OpenReels Puente abierto?`,
      1,
      true,
    );
  }
  if (!gflowRelayEnabled()) {
    throw new GflowCliError("Falta GFLOW_BRIDGE_URL o GFLOW_BRIDGE_TOKEN para el puente remoto", 1, true);
  }
  const payload = await viaRelay("image", body, 270);
  return decodePng(payload.png);
}

function decodePng(b64: unknown): Buffer {
  if (typeof b64 !== "string") throw new GflowCliError("Puente gflow: falta png");
  const buf = Buffer.from(b64, "base64");
  if (buf.length < 1000) throw new GflowCliError(`Puente gflow: imagen demasiado pequeña (${buf.length})`);
  return buf;
}

export async function bridgeGenerateVideo(opts: {
  prompt: string;
  aspect: string;
  model: string;
  durationSeconds?: number;
  mode?: "t2v" | "i2v";
  imagePng?: Buffer;
}): Promise<{ filePath: string; durationSeconds: number }> {
  return enqueueGflow(() => bridgeGenerateVideoNow(opts));
}

async function bridgeGenerateVideoNow(opts: {
  prompt: string;
  aspect: string;
  model: string;
  durationSeconds?: number;
  mode?: "t2v" | "i2v";
  imagePng?: Buffer;
}): Promise<{ filePath: string; durationSeconds: number }> {
  const mode = opts.mode === "i2v" ? "i2v" : "t2v";
  const body = {
    prompt: opts.prompt,
    aspect: opts.aspect,
    model: opts.model,
    mode,
    ...(opts.durationSeconds != null ? { durationSeconds: opts.durationSeconds } : {}),
    ...(mode === "i2v" && opts.imagePng && opts.imagePng.length > 80
      ? { imagePng: opts.imagePng.toString("base64") }
      : {}),
  };

  const writeMp4 = (b64: unknown, duration: unknown) => {
    if (typeof b64 !== "string") throw new GflowCliError("Puente gflow: falta mp4");
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 20_000) throw new GflowCliError(`Puente gflow: video demasiado pequeño (${buf.length})`);
    const dest = path.join(os.tmpdir(), `openreels-gflow-bridge-${Date.now()}.mp4`);
    fs.writeFileSync(dest, buf);
    const durationSeconds =
      typeof duration === "number" ? duration : opts.durationSeconds;
    return { filePath: dest, durationSeconds };
  };

  if (await preferLan()) {
    try {
      const res = await bridgeFetch(
        "/v1/video",
        { method: "POST", body: JSON.stringify(body) },
        520_000,
      );
      const payload = await readBridgeJson(res);
      return writeMp4(payload["mp4"], payload["durationSeconds"]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!gflowRelayEnabled() || !isGflowBridgeUnreachable(msg)) throw err;
      rememberLanDown();
    }
  } else if (gflowBridgeUrl() && !gflowRelayEnabled()) {
    throw new GflowCliError(
      `No se alcanzó el puente Windows (${gflowBridgeUrl()}). ¿Está OpenReels Puente abierto?`,
      1,
      true,
    );
  }
  if (!gflowRelayEnabled()) {
    throw new GflowCliError("Falta GFLOW_BRIDGE_URL o GFLOW_BRIDGE_TOKEN para el puente remoto", 1, true);
  }
  const payload = await viaRelay("video", body, 520);
  return writeMp4(payload.mp4, payload.durationSeconds);
}
