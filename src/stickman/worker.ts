import type { Job } from "bullmq";
import { Queue, Worker } from "bullmq";
import type IORedis from "ioredis";
import { resolveAtlasApiKey } from "../providers/atlas/client.js";
import { DEFAULT_STICKMAN_TTS_MODEL } from "./catalog.js";
import { runAssemble, runMotion, runTts, runVisuals } from "./runner.js";
import { hydrateJobFromSnapshot, readMeta, readScript, setStatus, stickmanJobsDir } from "./store.js";

export const STICKMAN_QUEUE_NAME = "stickman-studio";
export const STICKMAN_WORKER_HEARTBEAT_KEY = "stickman:worker:heartbeat";

export type StickmanWork = { id: string; action: "produce" };

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

function apiKeyOf(id: string): string {
  const meta = readMeta(id);
  const key = resolveAtlasApiKey(meta?.config.atlasKey);
  if (!key) throw new Error("Falta ATLASCLOUD_API_KEY (Ajustes o .env)");
  return key;
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
  const key = apiKeyOf(id);
  const log = logTo(id);
  setStatus(id, "producing", "tts", "Generando voz");
  await runTts(id, key, meta.config.atlasTtsModel || DEFAULT_STICKMAN_TTS_MODEL, log);
  setStatus(id, "producing", "visuals", "Dibujando palitos");
  await runVisuals(id, key, log);
  setStatus(id, "producing", "motion", script.animate ? "Animando flipbook" : "Hold + zoom");
  await runMotion(id, key, log);
  setStatus(id, "producing", "assemble", "Ensamblando final.mp4");
  await runAssemble(id, log);
  setStatus(id, "completed", "done", "Listo", { completedAt: new Date().toISOString() });
}

export function startStickmanWorker(connection: IORedis): Worker {
  const beat = () => {
    void connection.set(STICKMAN_WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", 90).catch((err) => {
      console.warn("[stickman] heartbeat failed", err);
    });
  };
  beat();
  const timer = setInterval(beat, 20_000);
  const worker = new Worker(
    STICKMAN_QUEUE_NAME,
    async (job: Job<StickmanWork>) => {
      const { id } = job.data;
      console.log(`[stickman] produce ${id} dir=${stickmanJobsDir()}`);
      try {
        await handleProduce(id, connection);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[stickman] produce ${id} failed: ${msg}`);
        try {
          setStatus(id, "failed", "error", msg, { error: msg });
        } catch (statusErr) {
          console.error(`[stickman] could not write failure for ${id}`, statusErr);
        }
        throw err;
      }
    },
    { connection, concurrency: 1 },
  );
  worker.on("closed", () => clearInterval(timer));
  return worker;
}

export function createStickmanQueue(connection: IORedis): Queue<StickmanWork> {
  return new Queue<StickmanWork>(STICKMAN_QUEUE_NAME, { connection });
}
