import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { Queue, QueueEvents } from "bullmq";
import Fastify from "fastify";
import IORedis from "ioredis";
import { z } from "zod";
import { PACING_CONFIG } from "./agents/creative-director.js";
import { registerAnalyticsRoutes } from "./analytics/routes.js";
import { type AuthedRequest, registerAuth, requireUser } from "./auth/plugin.js";
import { getArchetype, listArchetypes } from "./config/archetype-registry.js";
import { ATELIER_STYLES } from "./config/atelier-styles.js";
import { PLATFORMS } from "./config/platforms.js";
import { registerFilmRoutes } from "./film/routes.js";
import { registerLibraryRoutes } from "./library/routes.js";
import { AliCloudImage } from "./providers/image/alicloud.js";
import { FalImage } from "./providers/image/fal.js";
import { GeminiImage } from "./providers/image/gemini.js";
import { GrokImage } from "./providers/image/grok.js";
import { OpenAIImage } from "./providers/image/openai.js";
import { RunPodImage } from "./providers/image/runpod.js";
import { ViviImage } from "./providers/image/vivi.js";
import { AliCloudLLM } from "./providers/llm/alicloud.js";
import { AnthropicLLM } from "./providers/llm/anthropic.js";
import { GeminiLLM } from "./providers/llm/gemini.js";
import { GrokLLM } from "./providers/llm/grok.js";
import { OpenAILLM } from "./providers/llm/openai.js";
import { OpenRouterLLM } from "./providers/llm/openrouter.js";
import { ViviLLM } from "./providers/llm/vivi.js";
import { RUNPOD_IMAGE_MODELS, RUNPOD_VIDEO_MODELS } from "./providers/runpod/catalog.js";
import { ElevenLabsTTS } from "./providers/tts/elevenlabs.js";
import { GEMINI_TTS_VOICES, GeminiTTS } from "./providers/tts/gemini.js";
import { GROK_TTS_MODELS, GROK_TTS_VOICES, GrokTTS } from "./providers/tts/grok.js";
import { INWORLD_VOICES } from "./providers/tts/inworld.js";
import { KokoroTTS } from "./providers/tts/kokoro.js";
import { KOKORO_VOICES } from "./providers/tts/kokoro-voices.js";
import { OpenAITTS } from "./providers/tts/openai.js";
import { FalVideo } from "./providers/video/fal.js";
import { GeminiVideo } from "./providers/video/gemini.js";
import { GrokVideo } from "./providers/video/grok.js";
import { RunPodVideo } from "./providers/video/runpod.js";
import { ViviVideo } from "./providers/video/vivi.js";
import { registerSocial } from "./publish/plugin.js";
import { publishCompletedJob } from "./publish/run.js";
import { DirectorScore } from "./schema/director-score.js";
import type { SearchProviderKey } from "./schema/providers.js";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6379";
const PORT = Number(process.env["PORT"] ?? 3000);
const HOST = process.env["HOST"] ?? "0.0.0.0";
const JOBS_DIR = process.env["JOBS_DIR"] ?? path.join(process.cwd(), "jobs");
const MAX_JOBS = process.env["MAX_JOBS"] ? Number(process.env["MAX_JOBS"]) : 0;
const WEB_DIST = path.join(process.cwd(), "web", "dist");

// Ensure jobs directory exists
fs.mkdirSync(JOBS_DIR, { recursive: true });

/** Validate job ID to prevent path traversal — must be alphanumeric/hyphen/underscore only */
function isValidJobId(id: string): boolean {
  return /^[\w-]+$/.test(id);
}

function assertJobOwner(
  meta: { userId?: string },
  request: AuthedRequest,
  reply: { status: (n: number) => { send: (b: unknown) => unknown } },
): boolean {
  if (!request.user || meta.userId !== request.user.id) {
    reply.status(404).send({ error: "Job not found" });
    return false;
  }
  return true;
}

const redis = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue("openreels", { connection: redis });
const queueEvents = new QueueEvents("openreels", { connection: redis.duplicate() });

const app = Fastify({ logger: true, bodyLimit: 8 * 1024 * 1024 });

await app.register(cors, { origin: true, credentials: true });

await registerAuth(app, redis);
await registerSocial(app, redis);

queueEvents.on("completed", ({ jobId }) => {
  if (!jobId) return;
  void publishCompletedJob(jobId).catch((err) => {
    app.log.warn({ err, jobId }, "auto-publish failed");
  });
});

// Serve job artifacts from the jobs directory
await app.register(fastifyStatic, {
  root: JOBS_DIR,
  prefix: "/api/v1/jobs/",
  serve: false, // we handle serving manually for path traversal protection
});

// --- Health check ---
app.get("/api/v1/health", async () => {
  let redisOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch {}

  const jobsDirStats = fs.statSync(JOBS_DIR, { throwIfNoEntry: false });

  return {
    status: redisOk ? "healthy" : "degraded",
    redis: redisOk ? "connected" : "disconnected",
    jobsDir: jobsDirStats ? "exists" : "missing",
    keys: {
      ANTHROPIC_API_KEY: !!process.env["ANTHROPIC_API_KEY"],
      OPENAI_API_KEY: !!process.env["OPENAI_API_KEY"],
      GOOGLE_API_KEY: !!process.env["GOOGLE_API_KEY"],
      ELEVENLABS_API_KEY: !!process.env["ELEVENLABS_API_KEY"],
      INWORLD_TTS_API_KEY: !!process.env["INWORLD_TTS_API_KEY"],
      PEXELS_API_KEY: !!process.env["PEXELS_API_KEY"],
      PIXABAY_API_KEY: !!process.env["PIXABAY_API_KEY"],
      VIVI_LLM_API_KEY: !!process.env["VIVI_LLM_API_KEY"],
      VIVI_IMAGE_API_KEY: !!process.env["VIVI_IMAGE_API_KEY"],
      VIVI_VIDEO_API_KEY: !!process.env["VIVI_VIDEO_API_KEY"],
      ALICLOUD_API_KEY: !!process.env["ALICLOUD_API_KEY"],
      VIDU_API_KEY: !!process.env["VIDU_API_KEY"],
      TAVILY_API_KEY: !!process.env["TAVILY_API_KEY"],
      XAI_API_KEY: !!process.env["XAI_API_KEY"],
      FAL_API_KEY: !!process.env["FAL_API_KEY"],
      RUNPOD_API_KEY: !!process.env["RUNPOD_API_KEY"],
      YOUTUBE_API_KEY: !!process.env["YOUTUBE_API_KEY"],
    },
  };
});

// --- Aggregate stats ---
app.get("/api/v1/stats", async (request: AuthedRequest) => {
  if (!fs.existsSync(JOBS_DIR) || !request.user) {
    return { totalJobs: 0, completedJobs: 0, failedJobs: 0, activeJobs: 0, totalCost: 0 };
  }

  let totalJobs = 0;
  let completedJobs = 0;
  let failedJobs = 0;
  let activeJobs = 0;
  let totalCost = 0;

  const dirs = fs.readdirSync(JOBS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  await Promise.all(
    dirs.map(async (d) => {
      const metaPath = path.join(JOBS_DIR, d.name, "meta.json");
      try {
        const raw = await fs.promises.readFile(metaPath, "utf-8");
        const meta = JSON.parse(raw);
        if (meta.userId !== request.user?.id) return;
        totalJobs++;
        if (meta.status === "completed") {
          completedJobs++;
          const cost = meta.actualCost?.totalCost ?? meta.costEstimate?.totalCost ?? 0;
          totalCost += cost;
        } else if (meta.status === "failed" || meta.status === "cancelled") {
          failedJobs++;
        } else if (meta.status === "running" || meta.status === "queued") {
          activeJobs++;
        }
      } catch {}
    }),
  );

  return {
    totalJobs,
    completedJobs,
    failedJobs,
    activeJobs,
    totalCost: Math.round(totalCost * 100) / 100,
  };
});

// --- Archetypes ---
app.get("/api/v1/archetypes", async () => {
  const names = listArchetypes();
  return names.map((name) => {
    const config = getArchetype(name);
    return {
      name,
      label: config.label,
      captionStyle: config.captionStyle,
      artStyle: config.artStyle,
      mood: config.mood,
      colorPalette: config.colorPalette,
      visualColorPalette: config.visualColorPalette,
      scenePacing: config.scenePacing,
      motionIntensity: config.motionIntensity,
    };
  });
});

// --- Platforms ---
app.get("/api/v1/platforms", async () => {
  return Object.entries(PLATFORMS).map(([name, config]) => ({
    name,
    width: config.width,
    height: config.height,
    fps: config.fps,
    maxDurationSeconds: config.maxDurationSeconds,
    minDurationSeconds: config.minDurationSeconds,
    orientation: config.orientation ?? "portrait",
    longForm: config.longForm ?? false,
  }));
});

// --- Providers list ---
app.get("/api/v1/providers", async () => ({
  llm: [
    { key: "anthropic", label: "Anthropic (Claude)" },
    { key: "openai", label: "OpenAI (GPT)" },
    { key: "gemini", label: "Google Gemini" },
    { key: "openrouter", label: "OpenRouter" },
    { key: "openai-compatible", label: "Custom (OpenAI-compatible)" },
    { key: "vivi", label: "VIVI (Claude)" },
    { key: "alicloud", label: "Alibaba Cloud" },
    { key: "grok", label: "Grok (xAI)" },
  ],
  search: [
    { key: "native", label: "Native (provider built-in)" },
    { key: "tavily", label: "Tavily" },
    { key: "none", label: "None (parametric knowledge)" },
  ],
  tts: [
    { key: "elevenlabs", label: "ElevenLabs" },
    { key: "inworld", label: "Inworld" },
    { key: "kokoro", label: "Kokoro (Local)" },
    { key: "gemini-tts", label: "Gemini TTS" },
    { key: "openai-tts", label: "OpenAI TTS" },
    { key: "grok-tts", label: "Grok TTS" },
  ],
  inworldVoices: INWORLD_VOICES.map((v) => ({ id: v.id, label: v.label, lang: v.lang })),
  geminiTtsVoices: GEMINI_TTS_VOICES.map((v) => ({ id: v.id, label: v.label, gender: v.gender })),
  grokTtsVoices: GROK_TTS_VOICES.map((v) => ({ id: v.id, label: v.label, gender: v.gender })),
  grokTtsModels: GROK_TTS_MODELS.map((m) => ({ id: m.id, label: m.label })),
  kokoroVoices: KOKORO_VOICES.map((v) => ({
    id: v.id,
    label: v.label,
    gender: v.gender,
    language: v.language,
  })),
  runpodImageModels: RUNPOD_IMAGE_MODELS,
  runpodVideoModels: RUNPOD_VIDEO_MODELS,
  atelierStyles: ATELIER_STYLES,
  image: [
    { key: "gemini", label: "Google Gemini" },
    { key: "openai", label: "OpenAI (GPT Image)" },
    { key: "grok", label: "Grok Imagine Image" },
    { key: "vivi", label: "VIVI (Gemini)" },
    { key: "alicloud", label: "Alibaba Cloud" },
    { key: "runpod", label: "RunPod (FLUX / Wan públicos)" },
    { key: "fal", label: "fal.ai (FLUX)" },
  ],
  video: [
    { key: "gemini", label: "Google Veo" },
    { key: "grok", label: "Grok Imagine Video 1.5" },
    { key: "vivi", label: "VIVI (Grok Video 3)" },
    { key: "fal", label: "fal.ai (Kling 2.6 Pro)" },
    { key: "vidu-q2-fast", label: "VIDU Q2 Fast (~27cr/5s)" },
    { key: "vidu-q3-fast", label: "VIDU Q3 Fast" },
    { key: "runpod", label: "RunPod (Wan / Kling / Seedance)" },
  ],
}));

await registerAnalyticsRoutes(app);
await registerFilmRoutes(app);
await registerLibraryRoutes(app);

// --- API Test endpoints ---

app.post("/api/v1/test/llm", async (request, reply) => {
  const {
    provider = "anthropic",
    model,
    prompt,
  } = request.body as {
    provider?: string;
    model?: string;
    prompt: string;
  };
  if (!prompt?.trim()) return reply.status(400).send({ error: "prompt is required" });
  const start = Date.now();
  try {
    const llm = (() => {
      switch (provider) {
        case "openai":
          return new OpenAILLM(model);
        case "gemini":
          return new GeminiLLM(model);
        case "openrouter":
          return new OpenRouterLLM(model);
        case "vivi":
          return new ViviLLM(model);
        case "alicloud":
          return new AliCloudLLM(model);
        case "grok":
          return new GrokLLM(model);
        default:
          return new AnthropicLLM(model);
      }
    })();
    const result = await llm.generate({
      systemPrompt:
        "You are a helpful assistant. Answer the user's question directly and concisely.",
      userMessage: prompt,
      schema: z.object({ answer: z.string().describe("Your complete response") }),
    });
    return { text: result.data.answer, durationMs: Date.now() - start, tokens: result.usage };
  } catch (err) {
    reply.status(500);
    return { error: String(err) };
  }
});

app.post("/api/v1/test/tts", async (request, reply) => {
  const {
    provider = "elevenlabs",
    text,
    voice,
    speed,
    model,
  } = request.body as {
    provider?: string;
    text: string;
    voice?: string;
    speed?: number;
    model?: string;
  };
  if (!text?.trim()) return reply.status(400).send({ error: "text is required" });
  const start = Date.now();
  try {
    const tts = (() => {
      switch (provider) {
        case "gemini-tts":
          return new GeminiTTS(undefined, undefined, voice);
        case "openai-tts":
          return new OpenAITTS();
        case "grok-tts":
          return new GrokTTS(model, voice, undefined, speed);
        case "kokoro":
          return new KokoroTTS(voice, speed);
        default:
          return new ElevenLabsTTS();
      }
    })();
    const result = await tts.generate(text);
    return {
      audioBase64: result.audio.toString("base64"),
      durationMs: Date.now() - start,
      charCount: text.length,
    };
  } catch (err) {
    reply.status(500);
    return { error: String(err) };
  }
});

app.post("/api/v1/test/image", async (request, reply) => {
  const {
    provider = "gemini",
    prompt,
    style,
    aspectRatio = "9:16",
    model,
    steps,
    guidance,
  } = request.body as {
    provider?: string;
    prompt: string;
    style?: string;
    aspectRatio?: string;
    model?: string;
    steps?: number;
    guidance?: number;
  };
  if (!prompt?.trim()) return reply.status(400).send({ error: "prompt is required" });
  const start = Date.now();
  try {
    const imageGen = (() => {
      switch (provider) {
        case "openai":
          return new OpenAIImage();
        case "grok":
          return new GrokImage();
        case "vivi":
          return new ViviImage();
        case "alicloud":
          return new AliCloudImage();
        case "runpod":
          return new RunPodImage({ model, steps, guidance });
        case "fal":
          return new FalImage();
        default:
          return new GeminiImage();
      }
    })();
    const buffer = await imageGen.generate(prompt, style, undefined, aspectRatio);
    return { imageBase64: buffer.toString("base64"), durationMs: Date.now() - start };
  } catch (err) {
    reply.status(500);
    return { error: String(err) };
  }
});

app.post("/api/v1/test/video", async (request, reply) => {
  const {
    provider = "gemini",
    imageBase64,
    prompt,
    durationSeconds = 5,
    aspectRatio = "9:16",
    model,
    resolution,
  } = request.body as {
    provider?: string;
    imageBase64: string;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    model?: string;
    resolution?: string;
  };
  if (!imageBase64 || !prompt?.trim())
    return reply.status(400).send({ error: "imageBase64 and prompt are required" });
  const start = Date.now();
  try {
    const videoProvider = (() => {
      switch (provider) {
        case "grok":
          return new GrokVideo();
        case "vivi":
          return new ViviVideo();
        case "fal":
          return new FalVideo();
        case "runpod":
          return new RunPodVideo({ model, resolution });
        default:
          return new GeminiVideo();
      }
    })();
    const sourceImage = Buffer.from(imageBase64, "base64");
    const result = await videoProvider.generate({
      sourceImage,
      prompt,
      durationSeconds,
      aspectRatio,
    });
    const videoBuffer = await fsp.readFile(result.filePath);
    await fsp.unlink(result.filePath).catch(() => {});
    return {
      videoBase64: videoBuffer.toString("base64"),
      durationMs: Date.now() - start,
      videoSeconds: result.durationSeconds,
    };
  } catch (err) {
    reply.status(500);
    return { error: String(err) };
  }
});

// --- Job creation ---
interface CreateJobBody {
  topic: string;
  archetype?: string;
  pacing?: string;
  platform?: string;
  dryRun?: boolean;
  noMusic?: boolean;
  noVideo?: boolean;
  noSubtitles?: boolean;
  allowedVisualTypes?: string[];
  direction?: string;
  targetDurationMinutes?: number;
  score?: Record<string, unknown>;
  videoSceneMode?: string;
  styleReferenceImage?: string; // base64
  atelierMode?: boolean;
  artStyleOverride?: string;
  characterLock?: string;
  providers?: {
    llm?: string;
    tts?: string;
    image?: string;
    stock?: string;
    video?: string;
    videoModel?: string;
    music?: string;
    llmModel?: string;
    llmBaseUrl?: string;
    searchProvider?: SearchProviderKey;
    inworldVoice?: string;
    geminiTtsVoice?: string;
    grokTtsVoice?: string;
    grokTtsSpeed?: number;
    grokTtsModel?: string;
    kokoroVoice?: string;
    kokoroSpeed?: number;
    runpodImageModel?: string;
    runpodVideoModel?: string;
    runpodImageSteps?: number;
    runpodImageGuidance?: number;
    runpodVideoResolution?: string;
    runpodImageEndpointId?: string;
    runpodVideoEndpointId?: string;
  };
  keys?: Record<string, string>;
}

app.post<{ Body: CreateJobBody }>("/api/v1/jobs", async (request, reply) => {
  const user = requireUser(request as AuthedRequest, reply);
  if (!user) return;

  const {
    topic,
    archetype,
    pacing,
    platform,
    dryRun,
    noMusic,
    noVideo,
    noSubtitles,
    allowedVisualTypes,
    direction,
    targetDurationMinutes,
    score,
    videoSceneMode,
    styleReferenceImage,
    atelierMode,
    artStyleOverride,
    characterLock,
    providers,
    keys,
  } = request.body ?? {};

  if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
    return reply.status(400).send({ error: "topic is required" });
  }
  if (topic.trim().length > 500) {
    return reply.status(400).send({ error: "topic must be 500 characters or fewer" });
  }

  // Validate archetype if provided
  if (archetype) {
    try {
      getArchetype(archetype);
    } catch {
      return reply.status(400).send({ error: `Unknown archetype: ${archetype}` });
    }
  }

  // Validate pacing tier if provided
  const validPacingTiers = Object.keys(PACING_CONFIG);
  if (pacing && !validPacingTiers.includes(pacing)) {
    return reply
      .status(400)
      .send({ error: `Unknown pacing tier: ${pacing}. Available: ${validPacingTiers.join(", ")}` });
  }

  // Validate platform if provided
  const validPlatforms = Object.keys(PLATFORMS);
  if (platform && !validPlatforms.includes(platform)) {
    return reply
      .status(400)
      .send({ error: `Unknown platform: ${platform}. Available: ${validPlatforms.join(", ")}` });
  }

  // Validate style reference image if provided (base64, capped at ~8MB decoded)
  if (styleReferenceImage != null) {
    if (typeof styleReferenceImage !== "string") {
      return reply.status(400).send({ error: "styleReferenceImage must be a base64 string" });
    }
    if (Buffer.byteLength(styleReferenceImage, "base64") > 8 * 1024 * 1024) {
      return reply.status(400).send({ error: "styleReferenceImage exceeds 8MB limit" });
    }
  }

  // Validate direction text size if provided
  if (direction != null) {
    if (typeof direction !== "string") {
      return reply.status(400).send({ error: "direction must be a string" });
    }
    if (Buffer.byteLength(direction, "utf-8") > 65536) {
      return reply.status(400).send({ error: "direction exceeds 64KB limit" });
    }
  }

  if (characterLock != null) {
    if (typeof characterLock !== "string") {
      return reply.status(400).send({ error: "characterLock must be a string" });
    }
    if (Buffer.byteLength(characterLock, "utf-8") > 8192) {
      return reply.status(400).send({ error: "characterLock exceeds 8KB limit" });
    }
  }

  // Validate score (DirectorScore) if provided for replay
  let validatedScore: unknown | undefined;
  if (score != null) {
    const result = DirectorScore.safeParse(score);
    if (!result.success) {
      return reply.status(400).send({ error: `Invalid DirectorScore: ${result.error.message}` });
    }
    // Validate archetype exists in the registry (Zod accepts any string, but getArchetype throws for unknown names)
    try {
      getArchetype((result.data as { archetype: string }).archetype);
    } catch {
      return reply.status(400).send({
        error: `Score references unknown archetype: ${(result.data as { archetype: string }).archetype}`,
      });
    }
    validatedScore = result.data;
  }

  const job = await queue.add("render", {
    topic: topic.trim(),
    userId: user.id,
    archetype,
    pacing,
    platform: platform ?? "youtube",
    dryRun: dryRun ?? false,
    noMusic: noMusic === true,
    noVideo: noVideo === true,
    noSubtitles: noSubtitles === true,
    ...(allowedVisualTypes?.length ? { allowedVisualTypes } : {}),
    ...(direction?.trim() ? { direction: direction.trim() } : {}),
    ...(targetDurationMinutes != null
      ? { targetDurationMinutes: Number(targetDurationMinutes) }
      : {}),
    ...(validatedScore ? { score: validatedScore } : {}),
    ...(videoSceneMode ? { videoSceneMode } : {}),
    ...(styleReferenceImage ? { styleReferenceImage } : {}),
    atelierMode: atelierMode !== false,
    ...(artStyleOverride?.trim() ? { artStyleOverride: artStyleOverride.trim() } : {}),
    ...(characterLock?.trim() ? { characterLock: characterLock.trim() } : {}),
    providers: {
      llm: providers?.llm ?? "anthropic",
      tts: providers?.tts ?? "elevenlabs",
      image: providers?.image ?? "gemini",
      stock: providers?.stock ?? "pexels",
      video: providers?.video,
      videoModel: providers?.videoModel,
      music: providers?.music ?? "bundled",
      llmModel: providers?.llmModel,
      llmBaseUrl: providers?.llmBaseUrl,
      searchProvider: providers?.searchProvider,
      inworldVoice: providers?.inworldVoice,
      geminiTtsVoice: providers?.geminiTtsVoice,
      grokTtsVoice: providers?.grokTtsVoice,
      grokTtsSpeed: providers?.grokTtsSpeed,
      grokTtsModel: providers?.grokTtsModel,
      kokoroVoice: providers?.kokoroVoice,
      kokoroSpeed: providers?.kokoroSpeed,
      runpodImageModel: providers?.runpodImageModel,
      runpodVideoModel: providers?.runpodVideoModel,
      runpodImageSteps: providers?.runpodImageSteps,
      runpodImageGuidance: providers?.runpodImageGuidance,
      runpodVideoResolution: providers?.runpodVideoResolution,
      runpodImageEndpointId: providers?.runpodImageEndpointId,
      runpodVideoEndpointId: providers?.runpodVideoEndpointId,
    },
    keys: keys ?? {},
    jobsDir: JOBS_DIR,
  });

  // Create placeholder meta.json so GET /jobs/:id never 404s for a queued job
  const jobDir = path.join(JOBS_DIR, job.id!);
  fs.mkdirSync(jobDir, { recursive: true });
  const placeholderMeta = {
    id: job.id,
    topic: topic.trim(),
    userId: user.id,
    archetype,
    pacing,
    status: "queued",
    createdAt: new Date().toISOString(),
    stages: Object.fromEntries(
      ["research", "director", "tts", "visuals", "assembly", "critic"].map((s) => [
        s,
        { status: "pending" },
      ]),
    ),
    config: {
      llm: providers?.llm ?? "anthropic",
      tts: providers?.tts ?? "elevenlabs",
      image: providers?.image ?? "gemini",
      video: providers?.video,
      music: providers?.music ?? "bundled",
      platform: platform ?? "youtube",
      pacing: pacing,
      videoSceneMode: videoSceneMode,
      noVideo: noVideo === true || undefined,
      noSubtitles: noSubtitles === true || undefined,
      styleReference: styleReferenceImage ? true : undefined,
      atelierMode: atelierMode !== false,
      artStyleOverride: artStyleOverride?.trim() || undefined,
    },
  };
  fs.writeFileSync(path.join(jobDir, "meta.json"), JSON.stringify(placeholderMeta, null, 2));

  return reply.status(201).send({
    id: job.id,
    topic: topic.trim(),
    archetype,
    status: "queued",
  });
});

// --- Job listing ---
app.get("/api/v1/jobs", async (request: AuthedRequest) => {
  const { limit = "20", offset = "0" } = request.query as Record<string, string>;
  const limitNum = Math.min(Number(limit) || 20, 100);
  const offsetNum = Number(offset) || 0;

  if (!fs.existsSync(JOBS_DIR) || !request.user) return { jobs: [], total: 0 };

  const dirents = fs.readdirSync(JOBS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const entries = await Promise.all(
    dirents.map(async (d) => {
      const metaPath = path.join(JOBS_DIR, d.name, "meta.json");
      try {
        const raw = await fs.promises.readFile(metaPath, "utf-8");
        const meta = JSON.parse(raw);
        if (meta.userId !== request.user?.id) return null;
        return { id: d.name, ...meta };
      } catch {
        return null;
      }
    }),
  );
  const owned = entries.filter((e): e is NonNullable<typeof e> => e != null);
  owned.sort((a, b) =>
    ((b as { createdAt?: string }).createdAt ?? "").localeCompare(
      (a as { createdAt?: string }).createdAt ?? "",
    ),
  );

  return {
    jobs: owned.slice(offsetNum, offsetNum + limitNum),
    total: owned.length,
  };
});

// --- Job detail ---
app.get<{ Params: { id: string } }>("/api/v1/jobs/:id", async (request, reply) => {
  if (!isValidJobId(request.params.id)) {
    return reply.status(400).send({ error: "Invalid job ID" });
  }
  const jobDir = path.join(JOBS_DIR, request.params.id);
  const metaPath = path.join(jobDir, "meta.json");

  if (!fs.existsSync(metaPath)) {
    return reply.status(404).send({ error: "Job not found" });
  }

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  if (!assertJobOwner(meta, request as AuthedRequest, reply)) return;
  return meta;
});

// --- Job SSE events ---
app.get<{ Params: { id: string } }>("/api/v1/jobs/:id/events", async (request, reply) => {
  if (!isValidJobId(request.params.id)) {
    return reply.status(400).send({ error: "Invalid job ID" });
  }
  const jobId = request.params.id;

  // Check if job exists in BullMQ
  const jobDir = path.join(JOBS_DIR, jobId);
  const metaPath = path.join(jobDir, "meta.json");
  const job = await queue.getJob(jobId);
  if (!job) {
    // Job may have been cleaned from BullMQ (Redis restart, etc.) — fallback to meta.json
    if (fs.existsSync(metaPath)) {
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        if (
          meta.status === "completed" ||
          meta.status === "failed" ||
          meta.status === "cancelled"
        ) {
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          });
          reply.raw.write(`event: job:snapshot\ndata: ${JSON.stringify(meta)}\n\n`);
          const terminalEvent = meta.status === "completed" ? "job:completed" : "job:failed";
          reply.raw.write(
            `event: ${terminalEvent}\ndata: ${JSON.stringify({ state: meta.status })}\n\n`,
          );
          reply.raw.end();
          return;
        }
      } catch {}
    }
    return reply.status(404).send({ error: "Job not found" });
  }

  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Send current state as snapshot
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      reply.raw.write(`event: job:snapshot\ndata: ${JSON.stringify(meta)}\n\n`);
    } catch {}
  }

  // If job is already finished, send completion and close
  const state = await job.getState();
  if (state === "completed" || state === "failed") {
    reply.raw.write(`event: job:${state}\ndata: ${JSON.stringify({ state })}\n\n`);
    reply.raw.end();
    return;
  }

  // Guard against double-cleanup (client disconnect + job complete can race)
  let cleaned = false;

  // Listen for progress updates
  const onProgress = ({ jobId: progressJobId, data }: { jobId: string; data: unknown }) => {
    if (cleaned || progressJobId !== jobId) return;
    try {
      const eventData = data as Record<string, unknown>;
      const stage = eventData.stage as string;
      reply.raw.write(`event: stage:${stage}\ndata: ${JSON.stringify(eventData)}\n\n`);
    } catch {}
  };

  const onCompleted = ({ jobId: completedJobId }: { jobId: string }) => {
    if (completedJobId === jobId) {
      try {
        reply.raw.write(`event: job:completed\ndata: {}\n\n`);
      } catch {}
      cleanup();
    }
  };

  const onFailed = ({
    jobId: failedJobId,
    failedReason,
  }: {
    jobId: string;
    failedReason: string;
  }) => {
    if (failedJobId === jobId) {
      try {
        reply.raw.write(`event: job:failed\ndata: ${JSON.stringify({ error: failedReason })}\n\n`);
      } catch {}
      cleanup();
    }
  };

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    queueEvents.off("progress", onProgress);
    queueEvents.off("completed", onCompleted);
    queueEvents.off("failed", onFailed);
    try {
      reply.raw.end();
    } catch {}
  };

  queueEvents.on("progress", onProgress);
  queueEvents.on("completed", onCompleted);
  queueEvents.on("failed", onFailed);

  // Cleanup on client disconnect
  request.raw.on("close", cleanup);
});

// --- Artifact serving (with path traversal protection) ---
app.get<{ Params: { id: string; "*": string } }>(
  "/api/v1/jobs/:id/artifacts/*",
  async (request, reply) => {
    const jobId = request.params.id;
    if (!isValidJobId(jobId)) {
      return reply.status(400).send({ error: "Invalid job ID" });
    }
    const artifactPath = request.params["*"];

    const jobDir = path.join(JOBS_DIR, jobId);
    const fullPath = path.resolve(jobDir, artifactPath);

    // Path traversal protection: ensure resolved path is within the job directory
    if (
      !fullPath.startsWith(path.resolve(jobDir) + path.sep) &&
      fullPath !== path.resolve(jobDir)
    ) {
      return reply.status(403).send({ error: "Access denied" });
    }

    if (!fs.existsSync(fullPath)) {
      return reply.status(404).send({ error: "Artifact not found" });
    }

    return reply.sendFile(path.relative(JOBS_DIR, fullPath), JOBS_DIR);
  },
);

// --- Job cancellation ---
app.post<{ Params: { id: string } }>("/api/v1/jobs/:id/cancel", async (request, reply) => {
  if (!isValidJobId(request.params.id)) {
    return reply.status(400).send({ error: "Invalid job ID" });
  }

  const jobId = request.params.id;
  const jobDir = path.join(JOBS_DIR, jobId);

  // Force-update meta to cancelled regardless of BullMQ state (handles stuck/orphaned jobs)
  const metaPath = path.join(jobDir, "meta.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (!assertJobOwner(meta, request as AuthedRequest, reply)) return;
      meta.cancelRequested = true;
      meta.status = "cancelled";
      meta.error = "Cancelled by user";
      const tmpPath = path.join(jobDir, ".meta.tmp");
      fs.writeFileSync(tmpPath, JSON.stringify(meta, null, 2));
      fs.renameSync(tmpPath, metaPath);
    } catch {}
  }

  // Try to remove from BullMQ — for active/stalled jobs the lock won't match,
  // so we try moveToFailed first (works for waiting jobs), then obliterate from queue.
  const job = await queue.getJob(jobId);
  if (job) {
    const state = await job.getState();
    if (state !== "completed" && state !== "failed") {
      try {
        await job.moveToFailed(new Error("Cancelled by user"), "0", true);
      } catch {}
      try {
        await job.remove();
      } catch {}
    }
  }

  return { status: "cancelled" };
});

// --- Job deletion ---
app.delete<{ Params: { id: string } }>("/api/v1/jobs/:id", async (request, reply) => {
  const jobId = request.params.id;
  if (!isValidJobId(jobId)) {
    return reply.status(400).send({ error: "Invalid job ID" });
  }
  const jobDir = path.join(JOBS_DIR, jobId);

  if (!fs.existsSync(jobDir)) {
    return reply.status(404).send({ error: "Job not found" });
  }
  const metaPath = path.join(jobDir, "meta.json");
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (!assertJobOwner(meta, request as AuthedRequest, reply)) return;
    } catch {
      return reply.status(404).send({ error: "Job not found" });
    }
  } else if (!(request as AuthedRequest).user) {
    return reply.status(401).send({ error: "Inicia sesión" });
  }

  // Force-remove from BullMQ regardless of state (handles orphaned/stuck active jobs).
  // For truly active jobs the worker will fail gracefully when it can't find the files.
  const job = await queue.getJob(jobId);
  if (job) {
    try {
      await job.moveToFailed(new Error("Deleted by user"), "0", true);
    } catch {}
    try {
      await job.remove();
    } catch {}
  }

  fs.rmSync(jobDir, { recursive: true, force: true });
  return { status: "deleted" };
});

// --- Auto-pruning helper ---
async function pruneOldJobs() {
  if (MAX_JOBS <= 0) return;

  const dirs = fs
    .readdirSync(JOBS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      const metaPath = path.join(JOBS_DIR, d.name, "meta.json");
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        return { id: d.name, status: meta.status, createdAt: meta.createdAt ?? "" };
      } catch {
        return { id: d.name, status: "unknown", createdAt: "" };
      }
    })
    .filter(
      (j) =>
        j.status === "completed" ||
        j.status === "failed" ||
        j.status === "cancelled" ||
        j.status === "unknown",
    )
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  while (dirs.length > MAX_JOBS) {
    const oldest = dirs.shift();
    if (oldest) {
      fs.rmSync(path.join(JOBS_DIR, oldest.id), { recursive: true, force: true });
    }
  }
}

// Export for worker to call after job completion
export { JOBS_DIR, MAX_JOBS, pruneOldJobs };

// --- Serve frontend SPA ---
if (fs.existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, {
    root: WEB_DIST,
    prefix: "/",
    decorateReply: false,
    wildcard: false,
  });

  // SPA fallback: serve index.html for all non-API routes
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html", WEB_DIST);
  });
}

// --- Start server ---
try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`OpenReels API server running on http://${HOST}:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
