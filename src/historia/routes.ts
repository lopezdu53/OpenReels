import type { FastifyInstance } from "fastify";
import type IORedis from "ioredis";
import type { AuthedRequest } from "../auth/plugin.js";
import { requireUser } from "../auth/plugin.js";
import { listCharacters, listLocations, listObjects } from "../library/store.js";
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
  isStickmanDuration,
  isStickmanLlmId,
  isStickmanVoiceId,
  recommendArc,
  recommendStickmanGflow,
  resolveStickmanTtsModel,
  STICKMAN_ARCS,
  STICKMAN_ASPECTS,
  STICKMAN_LLMS,
  STICKMAN_OMNI_DURATIONS,
  STICKMAN_OMNI_HOOK_DURATIONS,
  STICKMAN_VEO_DURATIONS,
  STICKMAN_VEO_HOOK_DURATIONS,
  STICKMAN_VOICES,
  stickmanDurationHint,
  stickmanHookAvailable,
} from "../stickman/catalog.js";
import { llmUsd } from "../stickman/cost.js";
import { draftScript } from "../stickman/draft.js";
import {
  createJob,
  finalPath,
  listJobs,
  saveJobSnapshot,
  setStatus,
  stillFiles,
  writeCastRef,
  writeScript,
} from "../stickman/store.js";
import type {
  HistoriaCastSnapshot,
  HistoriaLocationSnapshot,
  HistoriaObjectSnapshot,
  StickmanJobConfig,
} from "../stickman/types.js";

const MAX_CAST = 3;
const MAX_OBJECTS = 10;
const MAX_LOCATIONS = 3;

function idsOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function parseHistoriaCreateBody(
  userId: string,
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
  const arc = String(body.arc ?? recommendArc(topic));
  if (!isArcId(arc)) return { error: "Arco inválido" };
  const voiceId = isStickmanVoiceId(String(body.voiceId ?? "eve")) ? String(body.voiceId) : "eve";

  const characterIds = idsOf(body.characterIds).slice(0, MAX_CAST);
  const objectIds = idsOf(body.objectIds).slice(0, MAX_OBJECTS);
  const locationIds = idsOf(body.locationIds).slice(0, MAX_LOCATIONS);
  const libraryChars = listCharacters(userId);
  const libraryObjs = listObjects(userId);
  const libraryLocs = listLocations(userId);
  const castRoster: HistoriaCastSnapshot[] = characterIds
    .map((id) => libraryChars.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      species: c.species,
      age: c.age,
      sex: c.sex,
      appearance: c.appearance,
      personality: c.personality,
      wardrobe: c.wardrobe,
      mustKeep: c.mustKeep,
      mustAvoid: c.mustAvoid,
      notes: c.notes,
      aliases: c.aliases,
    }));
  if (castRoster.length < 1) {
    return { error: "Elige al menos un personaje del Casting" };
  }
  const objectRoster: HistoriaObjectSnapshot[] = objectIds
    .map((id) => libraryObjs.find((o) => o.id === id))
    .filter((o): o is NonNullable<typeof o> => Boolean(o))
    .map((o) => ({
      id: o.id,
      name: o.name,
      prompt: o.prompt,
      notes: o.notes,
      aliases: o.aliases,
    }));
  const locationRoster: HistoriaLocationSnapshot[] = locationIds
    .map((id) => libraryLocs.find((l) => l.id === id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
    .map((l) => ({
      id: l.id,
      name: l.name,
      place: l.place,
      timeOfDay: l.timeOfDay,
      weather: l.weather,
      mustKeep: l.mustKeep,
      mustAvoid: l.mustAvoid,
      notes: l.notes,
      aliases: l.aliases,
    }));

  return {
    config: {
      kind: "historia",
      topic,
      durationSec,
      aspect,
      language: String(body.language ?? "es"),
      look: "casting",
      castMode: castRoster.length > 1 ? "duo" : "solo",
      characterIds: castRoster.map((c) => c.id),
      objectIds: objectRoster.map((o) => o.id),
      locationIds: locationRoster.map((l) => l.id),
      castRoster,
      objectRoster,
      locationRoster,
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

export async function registerHistoriaRoutes(app: FastifyInstance, redis: IORedis): Promise<void> {
  app.get("/api/v1/historia/catalog", async () => ({
    arcs: STICKMAN_ARCS,
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

  app.get("/api/v1/historia/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    return {
      jobs: listJobs(user.id, 30, "historia").map((job) => ({
        ...job,
        previewRel:
          job.previewRel ?? (stillFiles(job.id)[0] ? `stills/${stillFiles(job.id)[0]}` : undefined),
        hasFinal: Boolean(finalPath(job.id)),
      })),
    };
  });

  app.post("/api/v1/historia/jobs", async (request: AuthedRequest, reply) => {
    const user = requireUser(request, reply);
    if (!user) return;
    const parsed = parseHistoriaCreateBody(user.id, (request.body ?? {}) as Record<string, unknown>);
    if ("error" in parsed) return reply.status(400).send({ error: parsed.error });
    const { config } = parsed;
    const meta = createJob(user.id, config);
    const firstRef = (config.characterIds ?? [])
      .map((id) => listCharacters(user.id).find((c) => c.id === id)?.referenceImage)
      .find((img) => Boolean(img));
    if (firstRef) writeCastRef(meta.id, firstRef);
    try {
      const { script, usage } = await draftScript(config, resolveAtlasApiKey());
      writeScript(meta.id, script);
      if (usage) {
        setStatus(meta.id, "awaiting_script", "script", "Revisa el guion de la historia", {
          cost: { tokens: usage.totalTokens, usd: llmUsd(config.llmModel, usage), credits: 0 },
        });
      } else {
        setStatus(meta.id, "awaiting_script", "script", "Revisa el guion de la historia");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus(meta.id, "failed", "script", msg, { error: msg });
      return reply.status(500).send({ error: msg, id: meta.id });
    }
    await saveJobSnapshot(redis, meta.id);
    return { id: meta.id, status: "awaiting_script" };
  });
}
