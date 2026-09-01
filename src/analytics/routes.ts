import type { FastifyInstance } from "fastify";
import type { NicheResearch } from "./research.js";
import { expandChannel, generateCalendar, generateStrategy, researchNiche } from "./research.js";
import { calendarSchema, strategySchema } from "./schemas.js";
import { youtubeApiKey } from "./youtube.js";

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
    if (!process.env["VIVI_LLM_API_KEY"]) {
      return reply.status(400).send({ error: "VIVI_LLM_API_KEY is required to generate strategy" });
    }
    try {
      const strategy = await generateStrategy(body.research, body.angle);
      return { strategy };
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
    if (!process.env["VIVI_LLM_API_KEY"]) {
      return reply.status(400).send({ error: "VIVI_LLM_API_KEY is required to generate calendar" });
    }
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
