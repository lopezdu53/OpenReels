import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type IORedis from "ioredis";
import type { AuthedRequest } from "../auth/plugin.js";
import { requireUser } from "../auth/plugin.js";
import {
  DEFAULT_BAKEOFF,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  KLING_VIDEO_MODEL,
  VOX_ARCS,
  VOX_ASPECTS,
  VOX_DURATIONS,
  VOX_THEMES,
  VOX_VOICES,
  recommendArc,
} from "./catalog.js";
import { draftBeats } from "./draft.js";
import { createVoxQueue, getVoxQueueStats } from "./worker.js";
import {
  bakeoffFiles,
  createJob,
  ensureVoxJobsDir,
  finalPath,
  isVoxJobId,
  jobDir,
  listJobs,
  patchMeta,
  readBeats,
  readMeta,
  setStatus,
  writeBeats,
  writeUpload,
} from "./store.js";
import type { VoxBeatsDoc, VoxJobConfig, VoxMode } from "./types.js";

function ownerOk(meta: { userId: string }, userId: string): boolean {
  return meta.userId === userId;
}

export async function registerVoxRoutes(app: FastifyInstance, redis: IORedis): Promise<void> {
  ensureVoxJobsDir();
  const queue = createVoxQueue(redis);

  app.get("/api/v1/vox/catalog", async () => ({
    themes: VOX_THEMES,
    arcs: VOX_ARCS,
    voices: VOX_VOICES,
    aspects: VOX_ASPECTS,
    durations: VOX_DURATIONS,
    defaultThemes: DEFAULT_BAKEOFF,
    defaultImageModel: DEFAULT_IMAGE_MODEL,
    defaultVideoModel: DEFAULT_VIDEO_MODEL,
    klingVideoModel: KLING_VIDEO_MODEL,
  }));

  app.get("/api/v1/vox/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return { jobs: listJobs(user.id) };
  });

  app.post("/api/v1/vox/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const topic = String(body.topic ?? "").trim();
    const mode = (body.mode as VoxMode) || "broll";
    if (mode === "broll" && topic.length < 4) {
      return reply.status(400).send({ error: "Escribe un tema (mín. 4 caracteres)" });
    }
    const durationSec = Number(body.durationSec ?? 30);
    if (!VOX_DURATIONS.includes(durationSec as (typeof VOX_DURATIONS)[number]) && ![15, 30, 60].includes(durationSec)) {
      return reply.status(400).send({ error: "Duración: 15, 30 o 60 segundos" });
    }
    const aspect = String(body.aspect ?? "16:9");
    if (!VOX_ASPECTS.includes(aspect as (typeof VOX_ASPECTS)[number])) {
      return reply.status(400).send({ error: "Aspecto inválido" });
    }
    const atlasKey = String(body.atlasKey ?? process.env["ATLASCLOUD_API_KEY"] ?? "");
    if (!atlasKey && mode !== "broll") {
      // A/C-roll always need Atlas; B-roll can draft a template first
    }
    const config: VoxJobConfig = {
      mode,
      topic: topic || (mode === "aroll" ? "A-roll talking head" : "C-roll collage"),
      durationSec,
      aspect,
      language: String(body.language ?? "es"),
      arc: String(body.arc ?? recommendArc(topic)),
      voiceId: String(body.voiceId ?? "leo"),
      voiceSpeed: Number(body.voiceSpeed ?? 1),
      themes: Array.isArray(body.themes) ? (body.themes as string[]).slice(0, 4) : [...DEFAULT_BAKEOFF],
      videoModel: body.realPeople ? KLING_VIDEO_MODEL : String(body.videoModel ?? DEFAULT_VIDEO_MODEL),
      imageModel: String(body.imageModel ?? DEFAULT_IMAGE_MODEL),
      motionStyle: String(body.motionStyle ?? "punchy"),
      constraints: String(body.constraints ?? "strict"),
      music: String(body.music ?? "editorial documentary, paper-texture percussion, instrumental, no vocals"),
      captions: body.captions !== false,
      captionStyle: String(body.captionStyle ?? "white"),
      watermark: String(body.watermark ?? "Made with Atlas Cloud · vox-director"),
      realPeople: body.realPeople === true,
      atlasKey: atlasKey || undefined,
      clonePersona: body.clonePersona ? String(body.clonePersona) : undefined,
      crollSubject: body.crollSubject === "product" ? "product" : "portrait",
      subjectWardrobe: body.subjectWardrobe ? String(body.subjectWardrobe) : undefined,
      subjectDesc: body.subjectDesc ? String(body.subjectDesc) : undefined,
    };

    const meta = createJob(user.id, config);

    if (typeof body.anchorPhoto === "string" && body.anchorPhoto.startsWith("data:")) {
      const photo = writeUpload(meta.id, "anchor", body.anchorPhoto);
      const beats = await draftBeats(config, atlasKey || undefined);
      beats.anchor_photo = photo;
      beats.mode = "croll";
      writeBeats(meta.id, beats);
      setStatus(meta.id, "awaiting_beats", "beats", "Revisa el beat map (C-roll)");
      return { id: meta.id, status: "awaiting_beats" };
    }

    if (typeof body.arollVideo === "string" && body.arollVideo.startsWith("data:")) {
      if (!atlasKey) return reply.status(400).send({ error: "A-roll necesita ATLASCLOUD_API_KEY" });
      const source = writeUpload(meta.id, "aroll", body.arollVideo);
      await queue.add("asr", { id: meta.id, action: "asr", source }, { removeOnComplete: 50, removeOnFail: 50 });
      return { id: meta.id, status: "drafting" };
    }

    try {
      const beats = await draftBeats(config, atlasKey || undefined);
      if (typeof body.cloneRef === "string" && body.cloneRef.startsWith("data:")) {
        beats.voice.clone_ref = writeUpload(meta.id, "clone", body.cloneRef);
        if (config.clonePersona) beats.voice.persona = config.clonePersona;
      }
      writeBeats(meta.id, beats);
      setStatus(meta.id, "awaiting_beats", "beats", "Revisa el beat map");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(meta.id, "failed", "beats", msg, { error: msg });
      return reply.status(500).send({ error: msg, id: meta.id });
    }
    return { id: meta.id, status: "awaiting_beats" };
  });

  app.get<{ Params: { id: string } }>("/api/v1/vox/jobs/:id", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    const beats = readBeats(meta.id);
    const queueStats = await getVoxQueueStats(redis);
    return {
      ...meta,
      beats,
      bakeoff: bakeoffFiles(meta.id),
      hasFinal: Boolean(finalPath(meta.id)),
      queue: queueStats,
    };
  });

  app.patch<{ Params: { id: string } }>("/api/v1/vox/jobs/:id/beats", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    if (meta.status !== "awaiting_beats") {
      return reply.status(400).send({ error: "El beat map ya no se puede editar" });
    }
    const body = (request.body ?? {}) as { beats?: VoxBeatsDoc };
    if (!body.beats?.beats?.length) return reply.status(400).send({ error: "beats.json inválido" });
    writeBeats(meta.id, { ...body.beats, aspect_approx_confirmed: true });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/v1/vox/jobs/:id/approve-beats", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    if (meta.status !== "awaiting_beats") return reply.status(400).send({ error: "Nada que aprobar" });
    if (!readBeats(meta.id)) return reply.status(400).send({ error: "Falta beats.json" });
    if (!meta.config.atlasKey && !process.env["ATLASCLOUD_API_KEY"]) {
      return reply.status(400).send({ error: "Configura ATLASCLOUD_API_KEY en Ajustes" });
    }
    setStatus(meta.id, "baking", "style", "En cola: bake-off");
    await queue.add("bakeoff", { id: meta.id, action: "bakeoff" }, { removeOnComplete: 50, removeOnFail: 50 });
    return { ok: true, status: "baking" };
  });

  app.post<{ Params: { id: string } }>("/api/v1/vox/jobs/:id/retry-bakeoff", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    if (meta.status !== "baking" && meta.status !== "failed") {
      return reply.status(400).send({ error: "Este Vox no está en bake-off" });
    }
    if (!readBeats(meta.id)) return reply.status(400).send({ error: "Falta beats.json" });
    if (!meta.config.atlasKey && !process.env["ATLASCLOUD_API_KEY"]) {
      return reply.status(400).send({ error: "Configura ATLASCLOUD_API_KEY en Ajustes" });
    }
    setStatus(meta.id, "baking", "style", "En cola: bake-off");
    await queue.add("bakeoff", { id: meta.id, action: "bakeoff" }, { removeOnComplete: 50, removeOnFail: 50 });
    return { ok: true, status: "baking" };
  });

  app.post<{ Params: { id: string } }>("/api/v1/vox/jobs/:id/pick-style", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    if (meta.status !== "awaiting_style") return reply.status(400).send({ error: "Aún no hay bake-off" });
    const theme = String((request.body as { theme?: string } | undefined)?.theme ?? "").trim();
    if (!theme) return reply.status(400).send({ error: "Elige un theme" });
    const beats = readBeats(meta.id);
    if (!beats) return reply.status(400).send({ error: "Falta beats.json" });
    beats.theme = theme;
    beats.collage_style = theme;
    writeBeats(meta.id, beats);
    patchMeta(meta.id, { selectedTheme: theme });
    setStatus(meta.id, "producing", "produce", "En cola: producción");
    await queue.add("produce", { id: meta.id, action: "produce" }, { removeOnComplete: 50, removeOnFail: 50 });
    return { ok: true, status: "producing", theme };
  });

  app.get<{ Params: { id: string } }>("/api/v1/vox/jobs/:id/events", async (request: AuthedRequest, reply) => {
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
      reply.raw.write(`data: ${JSON.stringify({ ...cur, bakeoff: bakeoffFiles(cur.id), hasFinal: Boolean(finalPath(cur.id)) })}\n\n`);
    };
    send();
    const timer = setInterval(send, 1500);
    request.raw.on("close", () => {
      clearInterval(timer);
    });
  });

  app.get<{ Params: { id: string; "*": string } }>("/api/v1/vox/jobs/:id/artifacts/*", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    if (!isVoxJobId(request.params.id)) return reply.status(400).send({ error: "id inválido" });
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
      ".mp3": "audio/mpeg",
    };
    reply.header("Content-Type", types[ext] ?? "application/octet-stream");
    return reply.send(fs.createReadStream(full));
  });

  app.post<{ Params: { id: string } }>("/api/v1/vox/jobs/:id/cancel", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const meta = readMeta(request.params.id);
    if (!meta || !ownerOk(meta, user.id)) return reply.status(404).send({ error: "No encontrado" });
    setStatus(meta.id, "cancelled", "cancelled", "Cancelado");
    return { ok: true };
  });
}
