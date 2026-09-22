import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyInstance } from "fastify";
import type IORedis from "ioredis";
import type { AuthedRequest } from "../auth/plugin.js";
import { requireUser } from "../auth/plugin.js";
import { sendArtifact } from "../http/send-artifact.js";
import { resolveAtlasApiKey } from "../providers/atlas/client.js";
import { gflowBridgeUrl } from "../providers/gflow/bridge.js";
import { GFLOW_IMAGE_MODELS, GFLOW_VIDEO_MODELS } from "../providers/gflow/catalog.js";
import { gflowDoctor } from "../providers/gflow/client.js";
import { resolveStudioVisualProvider, STUDIO_VISUAL_PROVIDERS } from "../studio/visual-provider.js";
import {
  clampStickmanVoiceSpeed,
  clampStickmanVolume,
  DEFAULT_STICKMAN_CAPTIONS,
  DEFAULT_STICKMAN_CONTENT_HOOK,
  DEFAULT_STICKMAN_GFLOW_IMAGE,
  DEFAULT_STICKMAN_GFLOW_VIDEO,
  DEFAULT_STICKMAN_IMAGE_MODEL,
  DEFAULT_STICKMAN_LLM,
  DEFAULT_STICKMAN_MUTE_CHARACTER,
  DEFAULT_STICKMAN_TTS_MODEL,
  DEFAULT_STICKMAN_TTS_VOLUME,
  DEFAULT_STICKMAN_VIDEO_MODEL,
  DEFAULT_STICKMAN_VIDEO_VOLUME,
  isArcId,
  isCastMode,
  isLookId,
  isStickmanDuration,
  isStickmanLlmId,
  isStickmanVoiceId,
  publishPlatformsForAspect,
  recommendArc,
  recommendStickmanGflow,
  resolveStickmanTtsModel,
  STICKMAN_ARCS,
  STICKMAN_ASPECTS,
  STICKMAN_CASTS,
  STICKMAN_LLMS,
  STICKMAN_LOOKS,
  STICKMAN_OMNI_DURATIONS,
  STICKMAN_OMNI_HOOK_DURATIONS,
  STICKMAN_VEO_DURATIONS,
  STICKMAN_VEO_HOOK_DURATIONS,
  STICKMAN_VOICES,
  stickmanDurationHint,
  stickmanHookAvailable,
} from "./catalog.js";
import { llmUsd } from "./cost.js";
import { draftScript } from "./draft.js";
import {
  createJob,
  ensureStickmanJobsDir,
  finalPath,
  isStickmanFinalReady,
  isStickmanJobId,
  jobDir,
  listJobs,
  readMeta,
  readScript,
  saveJobSnapshot,
  setStatus,
  stillFiles,
  writeMeta,
  writeScript,
} from "./store.js";
import type { StickmanJobConfig, StickmanScript } from "./types.js";
import { createStickmanQueue, getStickmanQueueStats } from "./worker.js";

function parseStickmanCreateBody(
  body: Record<string, unknown>,
): { error: string } | { config: StickmanJobConfig } {
  const topic = String(body.topic ?? "").trim();
  if (topic.length < 4) return { error: "Escribe un tema (mín. 4 caracteres)" };
  const visualProvider = resolveStudioVisualProvider(
    typeof body.visualProvider === "string" ? body.visualProvider : undefined,
  );
  const gflowVideoModel = body.gflowVideoModel ? String(body.gflowVideoModel) : undefined;
  const durationSec = Number(body.durationSec ?? 30);
  if (!isStickmanDuration(durationSec, visualProvider, gflowVideoModel)) {
    return { error: stickmanDurationHint(visualProvider, gflowVideoModel) };
  }
  const aspect = String(body.aspect ?? "9:16");
  if (!STICKMAN_ASPECTS.includes(aspect as (typeof STICKMAN_ASPECTS)[number])) {
    return { error: "Aspecto inválido" };
  }
  const look = String(body.look ?? "classic");
  if (!isLookId(look)) return { error: "Look inválido" };
  const castModeRaw = String(body.castMode ?? "solo");
  if (!isCastMode(castModeRaw)) return { error: "Elenco inválido" };
  const arc = String(body.arc ?? recommendArc(topic));
  if (!isArcId(arc)) return { error: "Arco inválido" };
  const voiceId = isStickmanVoiceId(String(body.voiceId ?? "eve")) ? String(body.voiceId) : "eve";
  return {
    config: {
      topic,
      durationSec,
      aspect,
      language: String(body.language ?? "es"),
      look,
      castMode: castModeRaw,
      arc,
      voiceId,
      voiceSpeed: clampStickmanVoiceSpeed(body.voiceSpeed),
      captions: body.captions === true,
      animate: body.animate === true,
      muteCharacter: body.muteCharacter !== false,
      contentHook:
        stickmanHookAvailable(durationSec, visualProvider, gflowVideoModel) &&
        body.contentHook === true,
      videoVolume: clampStickmanVolume(body.videoVolume, DEFAULT_STICKMAN_VIDEO_VOLUME),
      ttsVolume: clampStickmanVolume(body.ttsVolume, DEFAULT_STICKMAN_TTS_VOLUME),
      imageModel: String(body.imageModel ?? DEFAULT_STICKMAN_IMAGE_MODEL),
      videoModel: String(body.videoModel ?? DEFAULT_STICKMAN_VIDEO_MODEL),
      atlasTtsModel: resolveStickmanTtsModel(
        voiceId,
        String(body.atlasTtsModel ?? DEFAULT_STICKMAN_TTS_MODEL),
      ),
      visualProvider,
      gflowImageModel: body.gflowImageModel ? String(body.gflowImageModel) : undefined,
      gflowVideoModel,
      gflowVideoMode: body.gflowVideoMode ? String(body.gflowVideoMode) : undefined,
      llmModel: isStickmanLlmId(String(body.llmModel ?? ""))
        ? String(body.llmModel)
        : DEFAULT_STICKMAN_LLM,
    },
  };
}

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
    durations: STICKMAN_OMNI_DURATIONS,
    omniDurations: STICKMAN_OMNI_DURATIONS,
    veoDurations: STICKMAN_VEO_DURATIONS,
    hookDurations: STICKMAN_OMNI_HOOK_DURATIONS,
    omniHookDurations: STICKMAN_OMNI_HOOK_DURATIONS,
    veoHookDurations: STICKMAN_VEO_HOOK_DURATIONS,
    defaultMuteCharacter: DEFAULT_STICKMAN_MUTE_CHARACTER,
    defaultContentHook: DEFAULT_STICKMAN_CONTENT_HOOK,
    defaultCaptions: DEFAULT_STICKMAN_CAPTIONS,
    defaultVideoVolume: DEFAULT_STICKMAN_VIDEO_VOLUME,
    defaultTtsVolume: DEFAULT_STICKMAN_TTS_VOLUME,
    publishByAspect: {
      "9:16": publishPlatformsForAspect("9:16"),
      "16:9": publishPlatformsForAspect("16:9"),
      "1:1": publishPlatformsForAspect("1:1"),
    },
    defaultImageModel: DEFAULT_STICKMAN_IMAGE_MODEL,
    defaultVideoModel: DEFAULT_STICKMAN_VIDEO_MODEL,
    defaultTtsModel: DEFAULT_STICKMAN_TTS_MODEL,
    defaultLlm: DEFAULT_STICKMAN_LLM,
    llms: STICKMAN_LLMS,
    visualProviders: [...STUDIO_VISUAL_PROVIDERS],
    gflowImageModels: GFLOW_IMAGE_MODELS,
    gflowVideoModels: GFLOW_VIDEO_MODELS.filter((m) => m.id !== "veo-lite-lp"),
    recommendedGflow: recommendStickmanGflow(20),
    defaultGflowImage: DEFAULT_STICKMAN_GFLOW_IMAGE,
    defaultGflowVideo: DEFAULT_STICKMAN_GFLOW_VIDEO,
    atlasReady: Boolean(resolveAtlasApiKey()),
    gflowBridge: Boolean(gflowBridgeUrl()),
    doctor: await gflowDoctor(),
  }));

  app.get("/api/v1/stickman/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return {
      jobs: listJobs(user.id, 30, "stickman").map((job) => ({
        ...job,
        previewRel:
          job.previewRel ?? (stillFiles(job.id)[0] ? `stills/${stillFiles(job.id)[0]}` : undefined),
        hasFinal: Boolean(finalPath(job.id)),
      })),
    };
  });

  app.post("/api/v1/stickman/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const parsed = parseStickmanCreateBody((request.body ?? {}) as Record<string, unknown>);
    if ("error" in parsed) return reply.status(400).send({ error: parsed.error });
    const { config } = parsed;
    const meta = createJob(user.id, config);
    try {
      const { script, usage } = await draftScript(config, resolveAtlasApiKey());
      writeScript(meta.id, script);
      if (usage) {
        setStatus(meta.id, "awaiting_script", "script", "Revisa el guion de palitos", {
          cost: { tokens: usage.totalTokens, usd: llmUsd(config.llmModel, usage), credits: 0 },
        });
      } else {
        setStatus(meta.id, "awaiting_script", "script", "Revisa el guion de palitos");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(meta.id, "failed", "script", msg, { error: msg });
      return reply.status(500).send({ error: msg, id: meta.id });
    }
    await saveJobSnapshot(redis, meta.id);
    return { id: meta.id, status: "awaiting_script" };
  });

  app.get<{ Params: { id: string } }>(
    "/api/v1/stickman/jobs/:id",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const meta = readMeta(request.params.id);
      if (!meta || !ownerOk(meta, user.id))
        return reply.status(404).send({ error: "No encontrado" });
      const queueStats = await getStickmanQueueStats(redis);
      return {
        ...meta,
        script: readScript(meta.id),
        stills: stillFiles(meta.id),
        hasFinal: Boolean(finalPath(meta.id)),
        queue: queueStats,
      };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/v1/stickman/jobs/:id/script",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const meta = readMeta(request.params.id);
      if (!meta || !ownerOk(meta, user.id))
        return reply.status(404).send({ error: "No encontrado" });
      if (meta.status !== "awaiting_script") {
        return reply.status(400).send({ error: "El guion ya no se puede editar" });
      }
      const body = (request.body ?? {}) as { script?: StickmanScript };
      if (!body.script?.beats?.length)
        return reply.status(400).send({ error: "script.json inválido" });
      writeScript(meta.id, {
        ...body.script,
        style: meta.kind === "historia" ? "historia" : "stickman",
        provider: "atlas_cloud",
      });
      await saveJobSnapshot(redis, meta.id);
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/v1/stickman/jobs/:id/produce",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const meta = readMeta(request.params.id);
      if (!meta || !ownerOk(meta, user.id))
        return reply.status(404).send({ error: "No encontrado" });
      const body = (request.body ?? {}) as {
        voiceSpeed?: unknown;
        muteCharacter?: unknown;
        voiceId?: unknown;
        audioOnly?: unknown;
      };
      const audioOnly = body.audioOnly === true;
      if (audioOnly) {
        if (meta.status !== "completed" && meta.status !== "failed") {
          return reply
            .status(400)
            .send({ error: "Solo se puede mezclar voz en un video ya producido" });
        }
        if (!isStickmanFinalReady(meta.id)) {
          return reply.status(400).send({ error: "Falta final.mp4 para mezclar la voz Atlas" });
        }
      } else if (meta.status !== "awaiting_script" && meta.status !== "failed") {
        return reply.status(400).send({ error: "Nada que producir" });
      }
      if (!readScript(meta.id)) return reply.status(400).send({ error: "Falta script.json" });
      if (body.voiceSpeed != null) {
        meta.config.voiceSpeed = clampStickmanVoiceSpeed(body.voiceSpeed);
      }
      if (body.muteCharacter === true || body.muteCharacter === false) {
        meta.config.muteCharacter = body.muteCharacter;
      }
      const requestedVoice = typeof body.voiceId === "string" ? body.voiceId : "";
      if (requestedVoice && isStickmanVoiceId(requestedVoice)) {
        meta.config.voiceId = requestedVoice;
        meta.config.atlasTtsModel = resolveStickmanTtsModel(
          requestedVoice,
          meta.config.atlasTtsModel,
        );
      }
      if (audioOnly) meta.config.muteCharacter = false;
      const script = readScript(meta.id);
      if (script) {
        script.voice = {
          ...script.voice,
          voice_id: meta.config.voiceId,
          language: meta.config.language || script.voice.language,
          speed: meta.config.voiceSpeed,
        };
        script.muteCharacter = meta.config.muteCharacter === true;
        writeScript(meta.id, script);
      }
      writeMeta(meta);
      if (!resolveAtlasApiKey(meta.config.atlasKey)) {
        return reply
          .status(400)
          .send({ error: "Falta ATLASCLOUD_API_KEY en el servidor (video / video-worker)" });
      }
      setStatus(
        meta.id,
        "producing",
        audioOnly ? "tts" : "produce",
        audioOnly ? "En cola: voz Atlas" : meta.kind === "historia" ? "En cola: historia" : "En cola: palitos",
      );
      await saveJobSnapshot(redis, meta.id);
      await queue.add(
        audioOnly ? "remix-audio" : "produce",
        { id: meta.id, action: audioOnly ? "remix-audio" : "produce" },
        { removeOnComplete: 50, removeOnFail: 50 },
      );
      return { ok: true, status: "producing" };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/v1/stickman/jobs/:id/events",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const meta = readMeta(request.params.id);
      if (!meta || !ownerOk(meta, user.id))
        return reply.status(404).send({ error: "No encontrado" });
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
    },
  );

  app.get<{ Params: { id: string; "*": string } }>(
    "/api/v1/stickman/jobs/:id/artifacts/*",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      if (!isStickmanJobId(request.params.id))
        return reply.status(400).send({ error: "id inválido" });
      const meta = readMeta(request.params.id);
      if (!meta || !ownerOk(meta, user.id))
        return reply.status(404).send({ error: "No encontrado" });
      const rel = request.params["*"];
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
    "/api/v1/stickman/jobs/:id/cancel",
    async (request: AuthedRequest, reply) => {
      const user = requireUser(request, reply);
      if (!user) return;
      const meta = readMeta(request.params.id);
      if (!meta || !ownerOk(meta, user.id))
        return reply.status(404).send({ error: "No encontrado" });
      setStatus(meta.id, "cancelled", "cancelled", "Cancelado");
      return { ok: true };
    },
  );
}
