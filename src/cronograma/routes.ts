import type { FastifyInstance } from "fastify";
import { requireUser, type AuthedRequest } from "../auth/plugin.js";
import { createLabImageProvider } from "../lab/test-providers.js";
import { generateChannel, generateMonthPlan } from "./engine.js";
import { LATAM_TIMEZONES } from "./hours.js";
import { firstReadyLlm, listImageStatus, listLlmStatus } from "./llm.js";
import { CRONOGRAMA_CATEGORIES, listCronogramaNiches } from "./niches.js";
import { channelKitSchema } from "./schemas.js";

export async function registerCronogramaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/cronograma/status", async () => ({
    llms: listLlmStatus(),
    images: listImageStatus(),
    defaultLlm: firstReadyLlm(),
    timezones: LATAM_TIMEZONES,
    categories: CRONOGRAMA_CATEGORIES,
  }));

  app.get("/api/v1/cronograma/niches", async () => ({
    niches: listCronogramaNiches(),
    categories: CRONOGRAMA_CATEGORIES,
  }));

  app.post("/api/v1/cronograma/channel", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    const body = (request.body ?? {}) as { nicheQuery?: string; llm?: string; angle?: string };
    if (!body.nicheQuery?.trim()) return reply.status(400).send({ error: "nicheQuery is required" });
    try {
      return await generateChannel({
        nicheQuery: body.nicheQuery,
        llm: body.llm || firstReadyLlm(),
        angle: body.angle,
      });
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/v1/cronograma/plan", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    const body = (request.body ?? {}) as {
      nicheQuery?: string;
      llm?: string;
      angle?: string;
      startDate?: string;
      days?: number;
      videosPerDay?: number;
      timezone?: string;
      channel?: unknown;
    };
    if (!body.nicheQuery?.trim()) return reply.status(400).send({ error: "nicheQuery is required" });
    const channel = body.channel ? channelKitSchema.safeParse(body.channel) : null;
    if (body.channel && channel && !channel.success) {
      return reply.status(400).send({ error: "channel inválido" });
    }
    try {
      const plan = await generateMonthPlan({
        nicheQuery: body.nicheQuery,
        llm: body.llm || firstReadyLlm(),
        angle: body.angle,
        startDate: body.startDate,
        days: body.days,
        videosPerDay: body.videosPerDay,
        timezone: body.timezone,
        channel: channel?.success ? channel.data : undefined,
      });
      return { plan };
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/v1/cronograma/image", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    const body = (request.body ?? {}) as {
      prompt?: string;
      provider?: string;
      kind?: "thumbnail" | "avatar" | "banner";
      model?: string;
    };
    if (!body.prompt?.trim()) return reply.status(400).send({ error: "prompt is required" });
    const kind = body.kind ?? "thumbnail";
    const aspect = kind === "avatar" ? "1:1" : "16:9";
    const start = Date.now();
    try {
      const imageGen = createLabImageProvider({ provider: body.provider ?? "vivi", model: body.model });
      const buffer = await imageGen.generate(body.prompt, undefined, undefined, aspect);
      return {
        imageBase64: buffer.toString("base64"),
        durationMs: Date.now() - start,
        aspect,
        kind,
        provider: body.provider ?? "vivi",
      };
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
