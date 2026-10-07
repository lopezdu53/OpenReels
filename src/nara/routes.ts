import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type IORedis from "ioredis";
import type { AuthedRequest } from "../auth/plugin.js";
import { requireUser } from "../auth/plugin.js";
import { sendArtifact } from "../http/send-artifact.js";
import type { TTSProviderKey } from "../schema/providers.js";
import {
  DEFAULT_NARA_TTS,
  isNaraDuration,
  isNaraLanguage,
  isNaraTone,
  isNaraTtsKey,
  NARA_DURATIONS,
  NARA_LANGUAGES,
  NARA_TONES,
  NARA_TTS_PROVIDERS,
  naraProvider,
  naraReadyFlags,
  targetWordCount,
} from "./catalog.js";
import {
  createJob,
  ensureNaraJobsDir,
  isNaraJobId,
  jobDir,
  listJobs,
  mp3Path,
  readMeta,
  readScript,
  setStatus,
} from "./store.js";
import type { NaraJobConfig } from "./types.js";
import { createNaraQueue, getNaraQueueStats } from "./worker.js";

function jobParam(request: AuthedRequest): string {
  return String((request.params as { id?: string }).id ?? "");
}

function splatParam(request: AuthedRequest): string {
  return String((request.params as { "*"?: string })["*"] ?? "");
}

function ownerOk(meta: { userId: string }, userId: string): boolean {
  return meta.userId === userId;
}

function parseCreateBody(body: Record<string, unknown>): { error: string } | { config: NaraJobConfig } {
  const idea = String(body.idea ?? "").trim();
  if (idea.length < 4) return { error: "Escribe una idea (mín. 4 caracteres)" };
  const durationSec = Number(body.durationSec ?? 30);
  if (!isNaraDuration(durationSec)) return { error: "Duración: 15, 30, 45, 60, 90 o 120 segundos" };
  const language = String(body.language ?? "es");
  if (!isNaraLanguage(language)) return { error: "Idioma inválido" };
  const tone = String(body.tone ?? "neutral");
  if (!isNaraTone(tone)) return { error: "Tono inválido" };
  const ttsProvider = String(body.ttsProvider ?? DEFAULT_NARA_TTS);
  if (!isNaraTtsKey(ttsProvider)) return { error: "Proveedor TTS inválido" };
  const spec = naraProvider(ttsProvider);
  const speedRaw = body.speed != null ? Number(body.speed) : spec.defaultSpeed;
  const stability = body.stability != null ? Number(body.stability) : undefined;
  const style = body.style != null ? Number(body.style) : undefined;
  return {
    config: {
      idea,
      durationSec,
      language,
      tone,
      ttsProvider: ttsProvider as TTSProviderKey,
      ttsModel: body.ttsModel ? String(body.ttsModel) : spec.defaultModel,
      voice: body.voice ? String(body.voice) : spec.defaultVoice,
      speed: speedRaw,
      stability: Number.isFinite(stability) ? stability : undefined,
      style: Number.isFinite(style) ? style : undefined,
      instructions: body.instructions ? String(body.instructions) : undefined,
    },
  };
}

export async function registerNaraRoutes(app: FastifyInstance, redis: IORedis): Promise<void> {
  ensureNaraJobsDir();
  const queue = createNaraQueue(redis);

  app.get("/api/v1/nara/catalog", async () => ({
    durations: [...NARA_DURATIONS],
    languages: [...NARA_LANGUAGES],
    tones: [...NARA_TONES],
    providers: NARA_TTS_PROVIDERS,
    defaultProvider: DEFAULT_NARA_TTS,
    defaultDuration: 30,
    ready: naraReadyFlags(),
    wordsPerMinute: 150,
  }));

  app.get("/api/v1/nara/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return { jobs: listJobs(user.id) };
  });

  app.post("/api/v1/nara/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const parsed = parseCreateBody((request.body ?? {}) as Record<string, unknown>);
    if ("error" in parsed) return reply.status(400).send({ error: parsed.error });
    const meta = createJob(user.id, parsed.config);
    await queue.add("produce", { id: meta.id, action: "produce" }, { removeOnComplete: 50, removeOnFail: 50 });
    return {
      id: meta.id,
      status: meta.status,
      targetWords: targetWordCount(parsed.config.durationSec),
    };
  });

  app.get<{ Params: { id: string } }>("/api/v1/nara/jobs/:id", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(jobParam(request));
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    const script = readScript(meta.id);
    const queueStats = await getNaraQueueStats(redis).catch(() => null);
    return {
      ...meta,
      hasMp3: Boolean(mp3Path(meta.id)),
      script: script?.script ?? null,
      title: meta.title ?? script?.title,
      queueStats,
    };
  });

  app.get<{ Params: { id: string } }>(
    "/api/v1/nara/jobs/:id/events",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const meta = readMeta(jobParam(request));
      if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
      reply.hijack();
      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const send = () => {
        const cur = readMeta(jobParam(request));
        if (!cur) return;
        const script = readScript(cur.id);
        reply.raw.write(
          `data: ${JSON.stringify({
            ...cur,
            hasMp3: Boolean(mp3Path(cur.id)),
            script: script?.script ?? null,
            title: cur.title ?? script?.title,
          })}\n\n`,
        );
      };
      send();
      const timer = setInterval(send, 1200);
      request.raw.on("close", () => {
        clearInterval(timer);
      });
    },
  );

  app.get<{ Params: { id: string; "*": string } }>(
    "/api/v1/nara/jobs/:id/artifacts/*",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      if (!isNaraJobId(jobParam(request))) return reply.status(400).send({ error: "id inválido" });
      const meta = readMeta(jobParam(request));
      if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
      const rel = splatParam(request);
      const full = path.resolve(jobDir(meta.id), rel);
      if (
        !full.startsWith(path.resolve(jobDir(meta.id)) + path.sep) &&
        full !== path.resolve(jobDir(meta.id))
      ) {
        return reply.status(403).send({ error: "Access denied" });
      }
      if (!fs.existsSync(full)) return reply.status(404).send({ error: "Artifact not found" });
      return sendArtifact(request, reply, full);
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/nara/jobs/:id/resynthesize",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const meta = readMeta(jobParam(request));
      if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
      if (!readScript(meta.id)) return reply.status(400).send({ error: "Aún no hay guion" });
      const body = (request.body ?? {}) as Record<string, unknown>;
      const merged: NaraJobConfig = {
        ...meta.config,
        ttsProvider: isNaraTtsKey(String(body.ttsProvider ?? meta.config.ttsProvider))
          ? (String(body.ttsProvider ?? meta.config.ttsProvider) as TTSProviderKey)
          : meta.config.ttsProvider,
        ttsModel: body.ttsModel != null ? String(body.ttsModel) : meta.config.ttsModel,
        voice: body.voice != null ? String(body.voice) : meta.config.voice,
        speed: body.speed != null ? Number(body.speed) : meta.config.speed,
        stability: body.stability != null ? Number(body.stability) : meta.config.stability,
        style: body.style != null ? Number(body.style) : meta.config.style,
        instructions: body.instructions != null ? String(body.instructions) : meta.config.instructions,
      };
      setStatus(meta.id, "queued", "queue", "Re-sintetizando", { config: merged, error: undefined });
      await queue.add(
        "resynthesize",
        { id: meta.id, action: "resynthesize" },
        { removeOnComplete: 50, removeOnFail: 50 },
      );
      return { ok: true, status: "queued" };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/nara/jobs/:id/cancel",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const meta = readMeta(jobParam(request));
      if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
      setStatus(meta.id, "cancelled", "cancelled", "Cancelado");
      return { ok: true };
    },
  );
}
