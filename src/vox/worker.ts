import type { Job } from "bullmq";
import { Queue, Worker } from "bullmq";
import type IORedis from "ioredis";
import { readBeats, readMeta, setStatus, writeBeats } from "./store.js";
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

export type VoxWork = { id: string; action: "bakeoff" | "produce" | "asr"; source?: string };

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

async function handleBakeoff(id: string): Promise<void> {
  const meta = readMeta(id);
  if (!meta) throw new Error("missing job");
  setStatus(id, "baking", "style", "Bake-off de estilos");
  const themes = meta.config.themes?.length ? meta.config.themes : ["american-retro", "swiss-modern", "punk-zine", "newsprint-editorial"];
  await runBakeoff(id, themes, apiKeyOf(id), logTo(id));
  setStatus(id, "awaiting_style", "style", "Elige un look", { bakeoffThemes: themes });
}

async function handleProduce(id: string): Promise<void> {
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

async function handleAsr(id: string, source: string): Promise<void> {
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
  return new Worker(
    VOX_QUEUE_NAME,
    async (job: Job<VoxWork>) => {
      const { id, action, source } = job.data;
      try {
        if (action === "bakeoff") await handleBakeoff(id);
        else if (action === "asr") await handleAsr(id, source ?? "");
        else await handleProduce(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setStatus(id, "failed", "error", msg, { error: msg });
        throw err;
      }
    },
    { connection, concurrency: 1 },
  );
}

export function createVoxQueue(connection: IORedis): Queue<VoxWork> {
  return new Queue<VoxWork>(VOX_QUEUE_NAME, { connection });
}
