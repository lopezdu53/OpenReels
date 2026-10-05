import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import { TobyError } from "./errors.js";

export interface TobyInboxResult {
  ok: boolean;
  bytes?: string;
  mime?: string;
  filename?: string;
  error?: string;
}

export interface TobyPendingJob {
  id: string;
  kind: "image" | "video";
  createdAt: number;
}

const PENDING_KEY = "toby:pending";
const TTL_SEC = 5400;

let redis: IORedis | null = null;
const memResults = new Map<string, TobyInboxResult>();
const memWaiters = new Map<string, Array<(r: TobyInboxResult) => void>>();
const memPending: TobyPendingJob[] = [];
const memAssets = new Map<string, { mime: string; bytes: Buffer; expires: number }>();

function redisUrl(): string {
  return process.env["REDIS_URL"] ?? "redis://localhost:6379";
}

export function tobyRedisEnabled(): boolean {
  if (process.env["TOBY_REDIS"] === "0") return false;
  return Boolean(process.env["REDIS_URL"] ?? process.env["TOBY_USE_REDIS"]);
}

function getRedis(): IORedis {
  if (!redis) redis = new IORedis(redisUrl(), { maxRetriesPerRequest: null });
  return redis;
}

function resultKey(id: string): string {
  return `toby:result:${id}`;
}

function assetKey(id: string): string {
  return `toby:asset:${id}`;
}

export async function registerTobyPending(kind: "image" | "video"): Promise<string> {
  const id = randomUUID();
  const job: TobyPendingJob = { id, kind, createdAt: Date.now() };
  if (tobyRedisEnabled()) {
    const r = getRedis();
    await r.lpush(PENDING_KEY, JSON.stringify(job));
    await r.expire(PENDING_KEY, TTL_SEC);
  } else {
    memPending.unshift(job);
  }
  return id;
}

export async function listTobyPending(): Promise<TobyPendingJob[]> {
  if (tobyRedisEnabled()) {
    const raw = await getRedis().lrange(PENDING_KEY, 0, 40);
    return raw
      .map((line) => {
        try {
          return JSON.parse(line) as TobyPendingJob;
        } catch {
          return null;
        }
      })
      .filter((j): j is TobyPendingJob => Boolean(j));
  }
  return [...memPending];
}

export async function dropTobyPending(id: string): Promise<void> {
  await dropPending(id);
}

async function dropPending(id: string): Promise<void> {
  if (tobyRedisEnabled()) {
    const r = getRedis();
    const items = await r.lrange(PENDING_KEY, 0, 80);
    for (const item of items) {
      try {
        const parsed = JSON.parse(item) as TobyPendingJob;
        if (parsed.id === id) await r.lrem(PENDING_KEY, 1, item);
      } catch {
        /* ignore */
      }
    }
    return;
  }
  const i = memPending.findIndex((j) => j.id === id);
  if (i >= 0) memPending.splice(i, 1);
}

export async function completeTobyResult(id: string, result: TobyInboxResult): Promise<void> {
  if (!id.trim()) throw new TobyError("id requerido");
  if (tobyRedisEnabled()) {
    const r = getRedis();
    await r.lpush(resultKey(id), JSON.stringify(result));
    await r.expire(resultKey(id), TTL_SEC);
    await dropPending(id);
    return;
  }
  memResults.set(id, result);
  const waiters = memWaiters.get(id) ?? [];
  memWaiters.delete(id);
  for (const w of waiters) w(result);
  await dropPending(id);
}

/** Oldest pending of this kind (FIFO for the Windows Auto Download folder). */
export async function completeTobyFifo(
  kind: "image" | "video",
  result: TobyInboxResult,
): Promise<string | null> {
  const pending = (await listTobyPending()).filter((j) => j.kind === kind);
  const oldest = pending.sort((a, b) => a.createdAt - b.createdAt)[0];
  if (!oldest) return null;
  await completeTobyResult(oldest.id, result);
  return oldest.id;
}

export async function waitTobyResult(id: string, timeoutMs: number): Promise<Buffer> {
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  if (tobyRedisEnabled()) {
    const r = getRedis().duplicate();
    try {
      const popped = await r.blpop(resultKey(id), timeoutSec);
      if (!popped) {
        throw new TobyError(
          "Toby no devolvió el archivo a tiempo. Activa Auto Download en la extensión y el agente Windows (carpeta → PUT).",
          true,
        );
      }
      return decodeResult(JSON.parse(popped[1] ?? "{}") as TobyInboxResult);
    } finally {
      r.disconnect();
    }
  }
  const existing = memResults.get(id);
  if (existing) {
    memResults.delete(id);
    return decodeResult(existing);
  }
  return new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      memWaiters.delete(id);
      reject(
        new TobyError(
          "Toby no devolvió el archivo a tiempo. Activa Auto Download en la extensión y el agente Windows (carpeta → PUT).",
          true,
        ),
      );
    }, timeoutMs);
    const list = memWaiters.get(id) ?? [];
    list.push((result) => {
      clearTimeout(timer);
      try {
        resolve(decodeResult(result));
      } catch (err) {
        reject(err);
      }
    });
    memWaiters.set(id, list);
  });
}

function decodeResult(parsed: TobyInboxResult): Buffer {
  if (!parsed.ok) throw new TobyError(parsed.error || "Toby inbox falló");
  const buf = Buffer.from(String(parsed.bytes ?? ""), "base64");
  if (buf.length < 800) throw new TobyError(`Toby inbox demasiado pequeño (${buf.length} bytes)`);
  return buf;
}

export async function putTobyPublicAsset(buf: Buffer, mime: string): Promise<string> {
  const id = randomUUID();
  if (tobyRedisEnabled()) {
    await getRedis().set(
      assetKey(id),
      JSON.stringify({ mime, bytes: buf.toString("base64") }),
      "EX",
      TTL_SEC,
    );
  } else {
    memAssets.set(id, { mime, bytes: buf, expires: Date.now() + TTL_SEC * 1000 });
  }
  return id;
}

export async function getTobyPublicAsset(
  id: string,
): Promise<{ mime: string; bytes: Buffer } | null> {
  if (tobyRedisEnabled()) {
    const raw = await getRedis().get(assetKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mime?: string; bytes?: string };
    return { mime: parsed.mime || "image/png", bytes: Buffer.from(String(parsed.bytes ?? ""), "base64") };
  }
  const hit = memAssets.get(id);
  if (!hit || hit.expires < Date.now()) {
    memAssets.delete(id);
    return null;
  }
  return { mime: hit.mime, bytes: hit.bytes };
}

/** Test helper: drop in-memory queues. */
export function resetTobyInboxForTests(): void {
  memResults.clear();
  memWaiters.clear();
  memPending.length = 0;
  memAssets.clear();
}
