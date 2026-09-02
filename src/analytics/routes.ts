import type { FastifyInstance } from "fastify";
import type { NicheResearch } from "./research.js";
import {
  cloneChannel,
  cloneContent,
  expandChannel,
  generateCalendar,
  generateStrategy,
  researchNiche,
} from "./research.js";
import { calendarSchema, strategySchema } from "./schemas.js";
import { curatedTopNiches, generateTopNiches } from "./top-niches.js";
import type { AnalyticsChannel, AnalyticsVideo } from "./youtube.js";
import { youtubeApiKey } from "./youtube.js";

function viviMissing(): string | null {
  return process.env["VIVI_LLM_API_KEY"] ? null : "VIVI_LLM_API_KEY is required";
}

export async function registerAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/analytics/status", async () => ({
    youtube: Boolean(youtubeApiKey()),
    tavily: Boolean(process.env["TAVILY_API_KEY"]),
    vivi: Boolean(process.env["VIVI_LLM_API_KEY"]),
  }));

  app.post("/api/v1/analytics/research", async (request, reply) => {
    const { query } = (request.body ?? {}) as { query?: string };
    if (!query?.trim()) return reply.status(400).send({ error: "query is required" });
    try {
      return await researchNiche(query);
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/v1/analytics/top-niches", async (request, reply) => {
    const body = (request.body ?? {}) as { region?: string; seed?: string; refresh?: boolean };
    try {
      if (body.refresh === false) {
        return curatedTopNiches(body.region);
      }
      return await generateTopNiches({ region: body.region, seed: body.seed });
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/v1/analytics/channel-videos", async (request, reply) => {
    const { channelId, niche } = (request.body ?? {}) as { channelId?: string; niche?: string };
    if (!channelId?.trim()) return reply.status(400).send({ error: "channelId is required" });
    try {
      return { videos: await expandChannel(channelId, niche ?? "") };
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/v1/analytics/strategy", async (request, reply) => {
    const body = (request.body ?? {}) as { research?: NicheResearch; angle?: string };
    if (!body.research?.query) return reply.status(400).send({ error: "research is required" });
    const missing = viviMissing();
    if (missing) return reply.status(400).send({ error: missing });
    try {
      const strategy = await generateStrategy(body.research, body.angle);
      return { strategy };
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/v1/analytics/clone-channel", async (request, reply) => {
    const body = (request.body ?? {}) as {
      channel?: AnalyticsChannel;
      videos?: AnalyticsVideo[];
      niche?: string;
      polish?: string;
    };
    if (!body.channel?.title) return reply.status(400).send({ error: "channel is required" });
    const missing = viviMissing();
    if (missing) return reply.status(400).send({ error: `${missing} to clone a channel` });
    try {
      const cloned = await cloneChannel({
        channel: body.channel,
        videos: body.videos,
        niche: body.niche,
        polish: body.polish,
      });
      return { cloned };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      reply.status(500);
      if (msg.includes("invalid_type") || msg.includes("expected")) {
        return {
          error: "Vivi no devolvió el JSON del clon (faltan campos). Reintenta Clonar canal.",
        };
      }
      return { error: msg };
    }
  });

  app.post("/api/v1/analytics/clone-content", async (request, reply) => {
    const body = (request.body ?? {}) as {
      video?: AnalyticsVideo;
      niche?: string;
      polish?: string;
    };
    if (!body.video?.title) return reply.status(400).send({ error: "video is required" });
    const missing = viviMissing();
    if (missing) return reply.status(400).send({ error: `${missing} to clone content` });
    try {
      const cloned = await cloneContent({
        video: body.video,
        niche: body.niche,
        polish: body.polish,
      });
      return { cloned };
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/v1/analytics/calendar", async (request, reply) => {
    const body = (request.body ?? {}) as {
      research?: NicheResearch;
      strategy?: unknown;
      videosPerDay?: number;
      days?: number;
      startDate?: string;
    };
    if (!body.research?.query) return reply.status(400).send({ error: "research is required" });
    const parsed = strategySchema.safeParse(body.strategy);
    if (!parsed.success) return reply.status(400).send({ error: "strategy is required" });
    const missing = viviMissing();
    if (missing) return reply.status(400).send({ error: missing });
    try {
      const calendar = await generateCalendar({
        research: body.research,
        strategy: parsed.data,
        videosPerDay: body.videosPerDay ?? 1,
        days: body.days,
        startDate: body.startDate,
      });
      calendarSchema.parse(calendar);
      return { calendar };
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
