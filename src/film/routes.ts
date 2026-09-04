import type { FastifyInstance } from "fastify";
import type { AuthedRequest } from "../auth/plugin.js";
import { requireUser } from "../auth/plugin.js";
import { generateFilmScript, parseYoutubeUrls } from "./script.js";

export async function registerFilmRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/film/script", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    const body = (request.body ?? {}) as {
      idea?: string;
      durationMinutes?: number;
      llm?: string;
      llmModel?: string;
      youtubeUrls?: string[];
      youtubeText?: string;
      characters?: Array<{ name: string; species?: string; kind?: string }>;
      previousStory?: string;
    };
    const sequel = body.previousStory?.trim() ?? "";
    const idea = body.idea?.trim() || (sequel ? "Continuación del episodio anterior" : "");
    if (idea.length < 4) return reply.status(400).send({ error: "Escribe una idea (mín. 4 caracteres)" });
    const fromText = body.youtubeText ? parseYoutubeUrls(body.youtubeText) : [];
    const youtubeUrls = [...new Set([...(body.youtubeUrls ?? []), ...fromText])].slice(0, 10);
    try {
      const script = await generateFilmScript({
        idea,
        durationMinutes: body.durationMinutes ?? 8,
        llm: body.llm,
        llmModel: body.llmModel,
        youtubeUrls,
        characters: Array.isArray(body.characters) ? body.characters.slice(0, 3) : undefined,
        previousStory: sequel || undefined,
      });
      return { script, youtubeUrls };
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
