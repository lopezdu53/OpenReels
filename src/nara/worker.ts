import * as fs from "node:fs";
import type { Job } from "bullmq";
import { Queue, Worker } from "bullmq";
import type IORedis from "ioredis";
import { transcodeToMp3 } from "./audio.js";
import { draftNaraScript } from "./script.js";
import {
  jobDir,
  mp3Path,
  readMeta,
  readScript,
  setStatus,
  wavPath,
  writeScript,
} from "./store.js";
import { createNaraTts } from "./tts.js";

export const NARA_QUEUE_NAME = "nara-studio";
export const NARA_WORKER_HEARTBEAT_KEY = "nara:worker:heartbeat";

export type NaraWork = { id: string; action: "produce" | "resynthesize" };

export async function getNaraQueueStats(connection: IORedis): Promise<{
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  workerLive: boolean;
}> {
  const q = new Queue(NARA_QUEUE_NAME, { connection });
  try {
    const counts = await q.getJobCounts("wait", "active", "failed", "delayed");
    const beat = await connection.get(NARA_WORKER_HEARTBEAT_KEY);
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

function assertActive(id: string): void {
  const meta = readMeta(id);
  if (!meta || meta.status === "cancelled") throw new Error("El trabajo fue cancelado");
}

async function speak(id: string): Promise<void> {
  const meta = readMeta(id);
  const doc = readScript(id);
  if (!meta || !doc) throw new Error("Falta guion");
  assertActive(id);
  setStatus(id, "speaking", "tts", `TTS ${meta.config.ttsProvider}`);
  const tts = createNaraTts(meta.config);
  const { audio } = await tts.generate(doc.script);
  if (!audio?.length) throw new Error("El TTS no devolvió audio");
  const wav = wavPath(id);
  fs.writeFileSync(wav, audio);
  setStatus(id, "encoding", "mp3", "Codificando MP3");
  const mp3 = transcodeToMp3(audio);
  fs.writeFileSync(pathMp3(id), mp3);
}

function pathMp3(id: string): string {
  return `${jobDir(id)}/voice.mp3`;
}

export async function runNaraJob(id: string, action: NaraWork["action"]): Promise<void> {
  const meta = readMeta(id);
  if (!meta) throw new Error(`Nara job ${id} no está en disco`);
  if (meta.status === "cancelled") return;

  if (action === "produce") {
    setStatus(id, "writing", "script", "Escribiendo el guion");
    const doc = await draftNaraScript(meta.config);
    writeScript(id, doc);
    setStatus(id, "writing", "script", "Guion listo", {
      title: doc.title,
      scriptChars: doc.script.length,
    });
  }

  await speak(id);
  assertActive(id);
  setStatus(id, "completed", "done", "Listo", {
    completedAt: new Date().toISOString(),
    hasMp3: Boolean(mp3Path(id)),
    scriptChars: readScript(id)?.script.length,
    title: readScript(id)?.title,
  });
}

export function startNaraWorker(connection: IORedis): Worker {
  const beat = () => {
    void connection
      .set(NARA_WORKER_HEARTBEAT_KEY, new Date().toISOString(), "EX", 90)
      .catch((err) => {
        console.warn("[nara] heartbeat failed", err);
      });
  };
  beat();
  const timer = setInterval(beat, 20_000);
  const worker = new Worker(
    NARA_QUEUE_NAME,
    async (job: Job<NaraWork>) => {
      const { id, action } = job.data;
      console.log(`[nara] ${action} ${id}`);
      try {
        await runNaraJob(id, action);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[nara] ${action} ${id} failed: ${msg}`);
        try {
          if (!/fue cancelado/i.test(msg)) {
            setStatus(id, "failed", "error", msg, { error: msg });
          }
        } catch (statusErr) {
          console.error(`[nara] could not write failure for ${id}`, statusErr);
        }
        throw err;
      }
    },
    { connection, concurrency: 1 },
  );
  worker.on("closed", () => clearInterval(timer));
  return worker;
}

export function createNaraQueue(connection: IORedis): Queue<NaraWork> {
  return new Queue<NaraWork>(NARA_QUEUE_NAME, { connection });
}
