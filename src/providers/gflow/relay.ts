import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import {
  GFLOW_PEERS_SET_KEY,
  GFLOW_SHARED_JOBS_KEY,
  jobsKeyFor,
  peerKey,
  pollKeysFor,
  sanitizeBridgeName,
  sanitizeBridgePeerId,
} from "./bridge-id.js";
import { GflowCliError } from "./errors.js";

export {
  GFLOW_SHARED_JOBS_KEY,
  isPinnedRemoteBridge,
  jobsKeyFor,
  normalizeGflowBridgeId,
  pollKeysFor,
  sanitizeBridgeName,
  sanitizeBridgePeerId,
} from "./bridge-id.js";

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

export interface GflowBridgePeer {
  id: string;
  name: string;
  hostname?: string;
  seenAt: number;
}

export interface GflowBridgeIdentity {
  id: string;
  name?: string;
  hostname?: string;
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

export async function markPeerOnline(identity: GflowBridgeIdentity): Promise<void> {
  const id = sanitizeBridgePeerId(identity.id);
  if (!id) return;
  const peer: GflowBridgePeer = {
    id,
    name: sanitizeBridgeName(identity.name, identity.hostname || "Windows"),
    hostname: identity.hostname ? sanitizeBridgeName(identity.hostname, id) : undefined,
    seenAt: Date.now(),
  };
  const r = getGflowRelayRedis();
  await r.set(peerKey(id), JSON.stringify(peer), "EX", ONLINE_TTL_SEC);
  await r.sadd(GFLOW_PEERS_SET_KEY, id);
}

export async function isBridgeOnline(): Promise<boolean> {
  const raw = await getGflowRelayRedis().get(ONLINE_KEY);
  if (raw) return true;
  const peers = await listOnlinePeers();
  return peers.length > 0;
}

export async function isPeerOnline(bridgeId: string): Promise<boolean> {
  const id = sanitizeBridgePeerId(bridgeId);
  if (!id) return false;
  const raw = await getGflowRelayRedis().get(peerKey(id));
  return Boolean(raw);
}

export async function listOnlinePeers(): Promise<GflowBridgePeer[]> {
  const r = getGflowRelayRedis();
  const ids = await r.smembers(GFLOW_PEERS_SET_KEY);
  const peers: GflowBridgePeer[] = [];
  for (const id of ids) {
    const raw = await r.get(peerKey(id));
    if (!raw) {
      await r.srem(GFLOW_PEERS_SET_KEY, id);
      continue;
    }
    try {
      const parsed = JSON.parse(raw) as GflowBridgePeer;
      if (parsed?.id) peers.push(parsed);
    } catch {
      await r.srem(GFLOW_PEERS_SET_KEY, id);
    }
  }
  return peers.sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export async function queuedBridgeJobs(): Promise<number> {
  return getGflowRelayRedis().llen(GFLOW_SHARED_JOBS_KEY);
}

export async function enqueueBridgeJob(
  kind: "image" | "video",
  body: Record<string, unknown>,
  targetId?: string,
): Promise<string> {
  const id = randomUUID();
  const job: GflowRelayJob = { id, kind, body };
  const r = getGflowRelayRedis();
  await r.set(payloadKey(id), JSON.stringify(job), "EX", 900);
  await r.lpush(jobsKeyFor(targetId), id);
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

export async function pollBridgeJob(
  waitSec: number,
  identity?: GflowBridgeIdentity,
): Promise<GflowRelayJob | null> {
  await markBridgeOnline();
  if (identity) await markPeerOnline(identity);
  const keys = pollKeysFor(identity?.id);
  const r = getGflowRelayRedis().duplicate();
  try {
    const popped = await r.blpop(...keys, waitSec);
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

export function parseBridgeIdentity(body: unknown): GflowBridgeIdentity | undefined {
  if (!body || typeof body !== "object") return undefined;
  const rec = body as Record<string, unknown>;
  const id = sanitizeBridgePeerId(rec.bridgeId ?? rec.id);
  if (!id) return undefined;
  return {
    id,
    name: typeof rec.name === "string" ? rec.name : undefined,
    hostname: typeof rec.hostname === "string" ? rec.hostname : undefined,
  };
}

export { isPinnedRemoteBridge as targetIsPinnedRemote };
export { normalizeGflowBridgeId as resolveBridgeTarget };
