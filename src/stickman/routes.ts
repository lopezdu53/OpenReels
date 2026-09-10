import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type IORedis from "ioredis";
import type { AuthedRequest } from "../auth/plugin.js";
import { requireUser } from "../auth/plugin.js";
import { resolveAtlasApiKey } from "../providers/atlas/client.js";
import {
  DEFAULT_STICKMAN_IMAGE_MODEL,
  DEFAULT_STICKMAN_TTS_MODEL,
  DEFAULT_STICKMAN_VIDEO_MODEL,
  STICKMAN_ARCS,
  STICKMAN_ASPECTS,
  STICKMAN_CASTS,
  STICKMAN_DURATIONS,
  STICKMAN_LOOKS,
  STICKMAN_VOICES,
  isArcId,
  isCastMode,
  isLookId,
  recommendArc,
} from "./catalog.js";
import { draftScript } from "./draft.js";
import {
  createJob,
  ensureStickmanJobsDir,
  finalPath,
  isStickmanJobId,
  jobDir,
  listJobs,
  readMeta,
  readScript,
  saveJobSnapshot,
  setStatus,
  stillFiles,
  writeScript,
} from "./store.js";
import type { StickmanJobConfig, StickmanScript } from "./types.js";
import { createStickmanQueue, getStickmanQueueStats } from "./worker.js";

function ownerOk(meta: { userId: string }, userId: string): boolean {
  return meta.userId === userId;
}

export async function registerStickmanRoutes(app: FastifyInstance, redis: IORedis): Promise<void> {
  ensureStickmanJobsDir();
  const queue = createStickmanQueue(redis);

  app.get("/api/v1/stickman/catalog", async () => ({
    looks: STICKMAN_LOOKS,
    arcs: STICKMAN_ARCS,
    casts: STICKMAN_CASTS,
    voices: STICKMAN_VOICES,
    aspects: STICKMAN_ASPECTS,
    durations: STICKMAN_DURATIONS,
    defaultImageModel: DEFAULT_STICKMAN_IMAGE_MODEL,
    defaultVideoModel: DEFAULT_STICKMAN_VIDEO_MODEL,
    defaultTtsModel: DEFAULT_STICKMAN_TTS_MODEL,
  }));

  app.get("/api/v1/stickman/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return { jobs: listJobs(user.id) };
  });

  app.post("/api/v1/stickman/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const topic = String(body.topic ?? "").trim();
    if (topic.length < 4) {
      return reply.status(400).send({ error: "Escribe un tema (mín. 4 caracteres)" });
    }
    const durationSec = Number(body.durationSec ?? 30);
    if (!STICKMAN_DURATIONS.includes(durationSec as (typeof STICKMAN_DURATIONS)[number])) {
      return reply.status(400).send({ error: "Duración: 15, 30, 60 o 90 segundos" });
    }
    const aspect = String(body.aspect ?? "9:16");
    if (!STICKMAN_ASPECTS.includes(aspect as (typeof STICKMAN_ASPECTS)[number])) {
      return reply.status(400).send({ error: "Aspecto inválido" });
    }
    const look = String(body.look ?? "classic");
    if (!isLookId(look)) return reply.status(400).send({ error: "Look inválido" });
    const castModeRaw = String(body.castMode ?? "solo");
    if (!isCastMode(castModeRaw)) return reply.status(400).send({ error: "Elenco inválido" });
    const arc = String(body.arc ?? recommendArc(topic));
    if (!isArcId(arc)) return reply.status(400).send({ error: "Arco inválido" });

    const config: StickmanJobConfig = {
      topic,
      durationSec,
      aspect,
      language: String(body.language ?? "es"),
      look,
      castMode: castModeRaw,
      arc,
      voiceId: String(body.voiceId ?? "eve"),
      voiceSpeed: Number(body.voiceSpeed ?? 1),
      captions: body.captions !== false,
      animate: body.animate === true,
      imageModel: String(body.imageModel ?? DEFAULT_STICKMAN_IMAGE_MODEL),
      videoModel: String(body.videoModel ?? DEFAULT_STICKMAN_VIDEO_MODEL),
      atlasTtsModel: String(body.atlasTtsModel ?? DEFAULT_STICKMAN_TTS_MODEL),
      atlasKey: resolveAtlasApiKey(typeof body.atlasKey === "string" ? body.atlasKey : undefined),
    };

    const meta = createJob(user.id, config);
    try {
      const script = await draftScript(config, config.atlasKey);
      writeScript(meta.id, script);
      setStatus(meta.id, "awaiting_script", "script", "Revisa el guion de palitos");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(meta.id, "failed", "script", msg, { error: msg });
      return reply.status(500).send({ error: msg, id: meta.id });
    }
    await saveJobSnapshot(redis, meta.id);
    return { id: meta.id, status: "awaiting_script" };
  });

  app.get<{ Params: { id: string } }>("/api/v1/stickman/jobs/:id", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    const queueStats = await getStickmanQueueStats(redis);
    return {
      ...meta,
      script: readScript(meta.id),
      stills: stillFiles(meta.id),
      hasFinal: Boolean(finalPath(meta.id)),
      queue: queueStats,
    };
  });

  app.patch<{ Params: { id: string } }>("/api/v1/stickman/jobs/:id/script", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    if (meta.status !== "awaiting_script") {
      return reply.status(400).send({ error: "El guion ya no se puede editar" });
    }
    const body = (request.body ?? {}) as { script?: StickmanScript };
    if (!body.script?.beats?.length) return reply.status(400).send({ error: "script.json inválido" });
    writeScript(meta.id, { ...body.script, style: "stickman", provider: "atlas_cloud" });
    await saveJobSnapshot(redis, meta.id);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/v1/stickman/jobs/:id/produce", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    if (meta.status !== "awaiting_script" && meta.status !== "failed") {
      return reply.status(400).send({ error: "Nada que producir" });
    }
    if (!readScript(meta.id)) return reply.status(400).send({ error: "Falta script.json" });
    if (!resolveAtlasApiKey(meta.config.atlasKey)) {
      return reply.status(400).send({ error: "Configura ATLASCLOUD_API_KEY en Ajustes" });
    }
    setStatus(meta.id, "producing", "produce", "En cola: palitos");
    await saveJobSnapshot(redis, meta.id);
    await queue.add("produce", { id: meta.id, action: "produce" }, { removeOnComplete: 50, removeOnFail: 50 });
    return { ok: true, status: "producing" };
  });

  app.get<{ Params: { id: string } }>("/api/v1/stickman/jobs/:id/events", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = () => {
      const cur = readMeta(request.params.id);
      if (!cur) return;
      reply.raw.write(
        `data: ${JSON.stringify({ ...cur, stills: stillFiles(cur.id), hasFinal: Boolean(finalPath(cur.id)) })}\n\n`,
      );
    };
    send();
    const timer = setInterval(send, 1500);
    request.raw.on("close", () => {
      clearInterval(timer);
    });
  });

  app.get<{ Params: { id: string; "*": string } }>("/api/v1/stickman/jobs/:id/artifacts/*", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    if (!isStickmanJobId(request.params.id)) return reply.status(400).send({ error: "id inválido" });
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    const rel = request.params["*"];
    const full = path.resolve(jobDir(meta.id), rel);
    if (!full.startsWith(path.resolve(jobDir(meta.id)) + path.sep) && full !== path.resolve(jobDir(meta.id))) {
      return reply.status(403).send({ error: "Access denied" });
    }
    if (!fs.existsSync(full)) return reply.status(404).send({ error: "Artifact not found" });
    const ext = path.extname(full).toLowerCase();
    const types: Record<string, string> = {
      ".mp4": "video/mp4",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".json": "application/json",
      ".wav": "audio/wav",
      ".mp3": "audio/mpeg",
    };
    reply.header("Content-Type", types[ext] ?? "application/octet-stream");
    return reply.send(fs.createReadStream(full));
  });

  app.post<{ Params: { id: string } }>("/api/v1/stickman/jobs/:id/cancel", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    setStatus(meta.id, "cancelled", "cancelled", "Cancelado");
    return { ok: true };
  });
}
