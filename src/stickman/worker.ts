import type { Job } from "bullmq";
import { Queue, Worker } from "bullmq";
import type IORedis from "ioredis";
import { resolveAtlasApiKey } from "../providers/atlas/client.js";
import { DEFAULT_STICKMAN_TTS_MODEL } from "./catalog.js";
import { estimateStickmanCost, type StickmanLlmUsage, ttsUsd } from "./cost.js";
import { runAssemble, runMotion, runTts, runVisuals } from "./runner.js";
import {
  hydrateJobFromSnapshot,
  isStickmanFinalReady,
  readMeta,
  readScript,
  setStatus,
  StickmanControlError,
  stickmanJobsDir,
  stillFiles,
  throwIfStickmanStopped,
  writeMeta,
} from "./store.js";
import { runYoutubePack } from "./youtube-pack.js";

export const STICKMAN_QUEUE_NAME = "stickman-studio";
export const STICKMAN_WORKER_HEARTBEAT_KEY = "stickman:worker:heartbeat";

/** Default BullMQ lock is 30s. Two Omni 10s I2V takes take minutes; the lock expires, the job restarts from TTS. */
export const STICKMAN_LOCK_DURATION_MS = 60 * 60 * 1000;
export const STICKMAN_LOCK_RENEW_MS = 15_000;

export type StickmanWork = { id: string; action: "produce" | "remix-audio" };

export async function getStickmanQueueStats(connection: IORedis): Promise<{
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  workerLive: boolean;
}> {
  const q = new Queue(STICKMAN_QUEUE_NAME, { connection });
  try {
    const counts = await q.getJobCounts("wait", "active", "failed", "delayed");
    const beat = await connection.get(STICKMAN_WORKER_HEARTBEAT_KEY);
    return {
      waiting: counts.wait ?? 0,
      active: counts.active ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      workerLive: Boolean(beat),
    };
  } finally {
    await q.close();
  }
}

function logTo(id: string) {
  return (line: string) => {
    if (!line.trim()) return;
    console.log(`[stickman ${id}] ${line.slice(0, 300)}`);
    const meta = readMeta(id);
    if (meta) setStatus(id, meta.status, meta.stage, line.slice(0, 180));
  };
}

function markPreview(id: string): void {
  const still = stillFiles(id)[0];
  if (!still) return;
  const cur = readMeta(id);
  if (cur && !cur.previewRel) {
    cur.previewRel = `stills/${still}`;
    writeMeta(cur);
  }
}

function finishRemixAudio(id: string): void {
  const latest = readMeta(id);
  if (!latest) return;
  const script = readScript(id);
  const narration = (script?.beats ?? []).map((beat) => beat.narration).join(" ").length;
  const usd = Math.round(ttsUsd(latest.config.atlasTtsModel, narration) * 10_000) / 10_000;
  setStatus(id, "completed", "done", "Listo · voz Atlas mezclada", {
    completedAt: new Date().toISOString(),
    cost: {
      tokens: latest.cost?.tokens ?? 0,
      usd: Math.round(((latest.cost?.usd ?? 0) + usd) * 10_000) / 10_000,
      credits: latest.cost?.credits ?? 0,
    },
  });
}

function finishProduce(id: string, extraUsage: StickmanLlmUsage | undefined): void {
  const latest = readMeta(id);
  if (!latest) return;
  const produce = estimateStickmanCost({
    config: latest.config,
    script: readScript(id),
    extraLlmUsage: extraUsage,
  });
  setStatus(id, "completed", "done", "Listo", {
    completedAt: new Date().toISOString(),
    cost: {
      tokens: (latest.cost?.tokens ?? 0) + (extraUsage?.totalTokens ?? 0),
      usd: Math.round(((latest.cost?.usd ?? 0) + produce.usd) * 10_000) / 10_000,
      credits: produce.credits,
    },
  });
}

function apiKeyOf(id: string): string {
  const meta = readMeta(id);
  const key = resolveAtlasApiKey(meta?.config.atlasKey);
  if (!key) throw new Error("Falta ATLASCLOUD_API_KEY en el servidor (video / video-worker)");
  return key;
}

async function handleRemixAudio(id: string, redis: IORedis): Promise<void> {
  await hydrateJobFromSnapshot(redis, id);
  const meta = readMeta(id);
  const script = readScript(id);
  if (!meta || !script) {
    throw new Error(
      `Stickman job ${id} no está en el disco compartido (${stickmanJobsDir()}). Quita el volumen extra montado en /app/jobs/stickman y deja solo jobs_data → /app/jobs.`,
    );
  }
  const log = logTo(id);
  const key = apiKeyOf(id);
  meta.config.muteCharacter = false;
  writeMeta(meta);
  setStatus(id, "producing", "tts", "Generando voz Atlas");
  await runTts(id, key, meta.config.atlasTtsModel || DEFAULT_STICKMAN_TTS_MODEL, log, {
    force: true,
  });
  setStatus(id, "producing", "assemble", "Mezclando voz Atlas en final.mp4");
  await runAssemble(id, log);
  finishRemixAudio(id);
}

async function handleProduce(id: string, redis: IORedis): Promise<void> {
  await hydrateJobFromSnapshot(redis, id);
  const meta = readMeta(id);
  const script = readScript(id);
  if (!meta || !script) {
    throw new Error(
      `Stickman job ${id} no está en el disco compartido (${stickmanJobsDir()}). Quita el volumen extra montado en /app/jobs/stickman y deja solo jobs_data → /app/jobs.`,
    );
  }
  const log = logTo(id);
  throwIfStickmanStopped(id);
  if (isStickmanFinalReady(id)) {
    log("produce: final.mp4 ya está listo; no regenero (lock de BullMQ)");
    if (meta.status !== "completed") {
      setStatus(id, "completed", "done", "Listo", {
        completedAt: meta.completedAt ?? new Date().toISOString(),
      });
    }
    return;
  }
  const key = apiKeyOf(id);
  throwIfStickmanStopped(id);
  if (meta.config.muteCharacter === true) {
    log("personaje mudo: sin TTS Atlas, sí efectos de Flow");
  } else {
    setStatus(id, "producing", "tts", "Generando voz Atlas");
    await runTts(id, key, meta.config.atlasTtsModel || DEFAULT_STICKMAN_TTS_MODEL, log);
  }
  setStatus(
    id,
    "producing",
    "visuals",
    meta.kind === "historia" ? "Generando stills del Casting" : "Dibujando palitos",
  );
  throwIfStickmanStopped(id);
  await runVisuals(id, meta.config, key, log);
  markPreview(id);
  throwIfStickmanStopped(id);
  setStatus(id, "producing", "motion", script.animate ? "Animando flipbook" : "Hold + zoom");
  await runMotion(id, meta.config, key, log);
  throwIfStickmanStopped(id);
  setStatus(id, "producing", "assemble", "Ensamblando final.mp4");
  await runAssemble(id, log);
  let extraUsage: StickmanLlmUsage | undefined;
  if (meta.config.aspect === "16:9") {
    setStatus(id, "producing", "youtube", "Portada y SEO YouTube");
    extraUsage = await runYoutubePack(id, key, log);
  }
  finishProduce(id, extraUsage);
}

export function startStickmanWorker(connection: IORedis): Worker {
  const beat = () => {
    void connection
      .set(STICKMAN_WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", 90)
      .catch((err) => {
        console.warn("[stickman] heartbeat failed", err);
      });
  };
  beat();
  const timer = setInterval(beat, 20_000);
  const worker = new Worker(
    STICKMAN_QUEUE_NAME,
    async (job: Job<StickmanWork>) => {
      const { id, action } = job.data;
      console.log(`[stickman] ${action ?? "produce"} ${id} dir=${stickmanJobsDir()}`);
      try {
        if (action === "remix-audio") await handleRemixAudio(id, connection);
        else await handleProduce(id, connection);
      } catch (err) {
        if (err instanceof StickmanControlError && err.action === "cancel") {
          setStatus(id, "cancelled", "cancelled", "Cancelado", { error: "Cancelado" });
          return;
        }
        if (err instanceof StickmanControlError && err.action === "stop") {
          setStatus(id, "failed", "error", "Detenido", { error: "Detenido" });
          return;
        }
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === "STICKMAN_CANCELLED") {
          setStatus(id, "cancelled", "cancelled", "Cancelado", { error: "Cancelado" });
          return;
        }
        if (msg === "STICKMAN_STOPPED") {
          setStatus(id, "failed", "error", "Detenido", { error: "Detenido" });
          return;
        }
        console.error(`[stickman] produce ${id} failed: ${msg}`);
        try {
          setStatus(id, "failed", "error", msg, { error: msg });
        } catch (statusErr) {
          console.error(`[stickman] could not write failure for ${id}`, statusErr);
        }
        throw err;
      }
    },
    {
      connection,
      concurrency: 1,
      lockDuration: STICKMAN_LOCK_DURATION_MS,
      lockRenewTime: STICKMAN_LOCK_RENEW_MS,
    },
  );
  worker.on("closed", () => clearInterval(timer));
  return worker;
}

export function createStickmanQueue(connection: IORedis): Queue<StickmanWork> {
  return new Queue<StickmanWork>(STICKMAN_QUEUE_NAME, { connection });
}
