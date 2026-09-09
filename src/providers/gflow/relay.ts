import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import { GflowCliError } from "./errors.js";

const JOBS_KEY = "gflow:bridge:jobs";
const ONLINE_KEY = "gflow:bridge:online";
const ONLINE_TTL_SEC = 45;

export interface GflowRelayJob {
  id: string;
  kind: "image" | "video";
  body: Record<string, unknown>;
}

export interface GflowRelayResult {
  ok: boolean;
  png?: string;
  mp4?: string;
  durationSeconds?: number;
  error?: string;
}

let redis: IORedis | null = null;

function redisUrl(): string {
  return process.env["REDIS_URL"] ?? "redis://localhost:6379";
}

export function gflowRelayEnabled(): boolean {
  if (process.env["GFLOW_BRIDGE_RELAY"] === "0") return false;
  const token = process.env["GFLOW_BRIDGE_TOKEN"]?.trim();
  return Boolean(token);
}

export function getGflowRelayRedis(): IORedis {
  if (!redis) {
    redis = new IORedis(redisUrl(), { maxRetriesPerRequest: null });
  }
  return redis;
}

function payloadKey(id: string): string {
  return `gflow:bridge:payload:${id}`;
}

function resultKey(id: string): string {
  return `gflow:bridge:result:${id}`;
}

export async function markBridgeOnline(): Promise<void> {
  await getGflowRelayRedis().set(ONLINE_KEY, String(Date.now()), "EX", ONLINE_TTL_SEC);
}

export async function isBridgeOnline(): Promise<boolean> {
  const raw = await getGflowRelayRedis().get(ONLINE_KEY);
  return Boolean(raw);
}

export async function queuedBridgeJobs(): Promise<number> {
  return getGflowRelayRedis().llen(JOBS_KEY);
}

export async function enqueueBridgeJob(
  kind: "image" | "video",
  body: Record<string, unknown>,
): Promise<string> {
  const id = randomUUID();
  const job: GflowRelayJob = { id, kind, body };
  const r = getGflowRelayRedis();
  await r.set(payloadKey(id), JSON.stringify(job), "EX", 900);
  await r.lpush(JOBS_KEY, id);
  return id;
}

export async function waitForBridgeResult(id: string, timeoutSec: number): Promise<GflowRelayResult> {
  const r = getGflowRelayRedis().duplicate();
  try {
    const popped = await r.blpop(resultKey(id), timeoutSec);
    if (!popped) {
      throw new GflowCliError(
        "El Windows remoto no contestó a tiempo. Abre OpenReels Puente (modo Remoto) en el PC con Chrome y Flow.",
        1,
        true,
      );
    }
    const parsed = JSON.parse(popped[1] ?? "{}") as GflowRelayResult;
    if (!parsed.ok) {
      throw new GflowCliError(parsed.error || "puente remoto falló", 1, true);
    }
    return parsed;
  } finally {
    r.disconnect();
  }
}

export async function pollBridgeJob(waitSec: number): Promise<GflowRelayJob | null> {
  await markBridgeOnline();
  const r = getGflowRelayRedis().duplicate();
  try {
    const popped = await r.blpop(JOBS_KEY, waitSec);
    if (!popped) return null;
    const id = popped[1];
    const raw = await getGflowRelayRedis().get(payloadKey(id));
    if (!raw) return null;
    await getGflowRelayRedis().del(payloadKey(id));
    return JSON.parse(raw) as GflowRelayJob;
  } finally {
    r.disconnect();
  }
}

export async function completeBridgeJob(id: string, result: GflowRelayResult): Promise<void> {
  if (!id.trim()) throw new Error("id requerido");
  await getGflowRelayRedis().lpush(resultKey(id), JSON.stringify(result));
  await getGflowRelayRedis().expire(resultKey(id), 900);
}
