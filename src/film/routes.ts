import type { FastifyInstance } from "fastify";
import type { AuthedRequest } from "../auth/plugin.js";
import { requireUser } from "../auth/plugin.js";
import { DEFAULT_FILM_LLM_MODEL } from "../config/film-duration.js";
import {
  DEFAULT_FILM_ARC,
  DEFAULT_FILM_LOOK,
  FILM_ARCS,
  FILM_LOOKS,
  isFilmArcId,
  isFilmLookId,
} from "./director-kit.js";
import { generateFilmScript, parseYoutubeUrls } from "./script.js";

export async function registerFilmRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/film/catalog", async () => ({
    looks: FILM_LOOKS,
    arcs: FILM_ARCS,
    defaultLook: DEFAULT_FILM_LOOK,
    defaultArc: DEFAULT_FILM_ARC,
  }));

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
      locations?: Array<{ name: string; place?: string }>;
      objects?: Array<{ name: string; prompt?: string }>;
      castMode?: string;
      previousStory?: string;
      lookId?: string;
      narrativeArc?: string;
    };
    const sequel = body.previousStory?.trim() ?? "";
    const idea = body.idea?.trim() || (sequel ? "Continuación del episodio anterior" : "");
    if (idea.length < 4)
      return reply.status(400).send({ error: "Escribe una idea (mín. 4 caracteres)" });
    if (body.lookId != null && !isFilmLookId(body.lookId)) {
      return reply.status(400).send({ error: "Unknown lookId" });
    }
    if (body.narrativeArc != null && !isFilmArcId(body.narrativeArc)) {
      return reply.status(400).send({ error: "Unknown narrativeArc" });
    }
    const fromText = body.youtubeText ? parseYoutubeUrls(body.youtubeText) : [];
    const youtubeUrls = [...new Set([...(body.youtubeUrls ?? []), ...fromText])].slice(0, 10);
    try {
      const script = await generateFilmScript({
        idea,
        durationMinutes: body.durationMinutes ?? 8,
        llm: body.llm ?? "atlas",
        llmModel: body.llmModel ?? DEFAULT_FILM_LLM_MODEL,
        youtubeUrls,
        characters: Array.isArray(body.characters) ? body.characters.slice(0, 3) : undefined,
        locations: Array.isArray(body.locations) ? body.locations.slice(0, 3) : undefined,
        objects: Array.isArray(body.objects) ? body.objects.slice(0, 10) : undefined,
        castMode: body.castMode === "hero" ? "hero" : "scene",
        previousStory: sequel || undefined,
        lookId: body.lookId && isFilmLookId(body.lookId) ? body.lookId : undefined,
        narrativeArc:
          body.narrativeArc && isFilmArcId(body.narrativeArc) ? body.narrativeArc : undefined,
      });
      return { script, youtubeUrls };
    } catch (err) {
      reply.status(500);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}
