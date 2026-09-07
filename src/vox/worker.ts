import type { Job } from "bullmq";
import { Queue, Worker } from "bullmq";
import type IORedis from "ioredis";
import { hydrateJobFromSnapshot, migrateLegacyVoxJobs, readBeats, readMeta, setStatus, voxJobsDir, writeBeats } from "./store.js";
import {
  runArollAssemble,
  runArollClips,
  runAsrBeats,
  runAssemble,
  runAudio,
  runBakeoff,
  runClips,
  runCrollKeyframes,
  runKeyframes,
} from "./runner.js";

export const VOX_QUEUE_NAME = "vox-director";
export const VOX_WORKER_HEARTBEAT_KEY = "vox:worker:heartbeat";

export type VoxWork = { id: string; action: "bakeoff" | "produce" | "asr"; source?: string };

export async function getVoxQueueStats(connection: IORedis): Promise<{
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  workerLive: boolean;
}> {
  const q = new Queue(VOX_QUEUE_NAME, { connection });
  try {
    const counts = await q.getJobCounts("wait", "active", "failed", "delayed");
    const beat = await connection.get(VOX_WORKER_HEARTBEAT_KEY);
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
    console.log(`[vox ${id}] ${line.slice(0, 300)}`);
    const meta = readMeta(id);
    if (meta) setStatus(id, meta.status, meta.stage, line.slice(0, 180));
  };
}

function apiKeyOf(id: string): string {
  const meta = readMeta(id);
  const key = meta?.config.atlasKey || process.env["ATLASCLOUD_API_KEY"];
  if (!key) throw new Error("Falta ATLASCLOUD_API_KEY (Ajustes o .env)");
  return key;
}

async function handleBakeoff(id: string, redis: IORedis): Promise<void> {
  migrateLegacyVoxJobs();
  await hydrateJobFromSnapshot(redis, id);
  const meta = readMeta(id);
  if (!meta) {
    throw new Error(
      `Vox job ${id} no está en el disco compartido (${voxJobsDir()}). Quita el volumen extra montado en /app/jobs/vox y deja solo jobs_data → /app/jobs.`,
    );
  }
  setStatus(id, "baking", "style", "Bake-off de estilos");
  const themes = meta.config.themes?.length ? meta.config.themes : ["american-retro", "swiss-modern", "punk-zine", "newsprint-editorial"];
  await runBakeoff(id, themes, apiKeyOf(id), logTo(id));
  setStatus(id, "awaiting_style", "style", "Elige un look", { bakeoffThemes: themes });
}

async function handleProduce(id: string, redis: IORedis): Promise<void> {
  migrateLegacyVoxJobs();
  await hydrateJobFromSnapshot(redis, id);
  const meta = readMeta(id);
  const beats = readBeats(id);
  if (!meta || !beats) throw new Error("missing job/beats");
  const key = apiKeyOf(id);
  const log = logTo(id);
  setStatus(id, "producing", "produce", "Generando collage");

  if (meta.config.mode === "aroll") {
    setStatus(id, "producing", "clips", "A-roll: restyle talking-head");
    await runArollClips(id, key, log);
    setStatus(id, "producing", "assemble", "A-roll assemble");
    await runArollAssemble(id, key, log);
  } else {
    if (meta.config.mode === "croll") {
      setStatus(id, "producing", "keyframes", "C-roll: posters anclados");
      await runCrollKeyframes(id, key, log);
    } else {
      setStatus(id, "producing", "keyframes", "Keyframes collage");
      await runKeyframes(id, key, log);
    }
    setStatus(id, "producing", "motion", "Animando posters");
    await runClips(id, key, log);
    setStatus(id, "producing", "audio", "Voz + música");
    await runAudio(id, key, log);
    setStatus(id, "producing", "assemble", "Ensamblando final.mp4");
    await runAssemble(id, key, log);
  }

  setStatus(id, "completed", "done", "Listo", { completedAt: new Date().toISOString() });
}

async function handleAsr(id: string, source: string, redis: IORedis): Promise<void> {
  await hydrateJobFromSnapshot(redis, id);
  setStatus(id, "drafting", "asr", "Transcribiendo A-roll");
  await runAsrBeats(id, source, apiKeyOf(id), logTo(id));
  const beats = readBeats(id);
  if (beats) {
    beats.aspect_approx_confirmed = true;
    writeBeats(id, beats);
  }
  setStatus(id, "awaiting_beats", "beats", "Revisa el beat map del A-roll");
}

export function startVoxWorker(connection: IORedis): Worker {
  migrateLegacyVoxJobs();
  const beat = () => {
    void connection.set(VOX_WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", 90).catch((err) => {
      console.warn("[vox] heartbeat failed", err);
    });
  };
  beat();
  const timer = setInterval(beat, 20_000);
  const worker = new Worker(
    VOX_QUEUE_NAME,
    async (job: Job<VoxWork>) => {
      const { id, action, source } = job.data;
      console.log(`[vox] ${action} ${id} dir=${voxJobsDir()}`);
      try {
        if (action === "bakeoff") await handleBakeoff(id, connection);
        else if (action === "asr") await handleAsr(id, source ?? "", connection);
        else await handleProduce(id, connection);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[vox] ${action} ${id} failed: ${msg}`);
        try {
          setStatus(id, "failed", "error", msg, { error: msg });
        } catch (statusErr) {
          console.error(`[vox] could not write failure for ${id}`, statusErr);
        }
        throw err;
      }
    },
    { connection, concurrency: 1 },
  );
  worker.on("closed", () => clearInterval(timer));
  return worker;
}

export function createVoxQueue(connection: IORedis): Queue<VoxWork> {
  return new Queue<VoxWork>(VOX_QUEUE_NAME, { connection });
}
