import type { FastifyInstance } from "fastify";
import { ATELIER_STYLES } from "../config/atelier-styles.js";
import type { AuthedRequest } from "../auth/plugin.js";
import { requireUser } from "../auth/plugin.js";
import { AliCloudImage } from "../providers/image/alicloud.js";
import { FalImage } from "../providers/image/fal.js";
import { GeminiImage } from "../providers/image/gemini.js";
import { GrokImage } from "../providers/image/grok.js";
import { OpenAIImage } from "../providers/image/openai.js";
import { RunPodImage } from "../providers/image/runpod.js";
import { ViviImage } from "../providers/image/vivi.js";
import {
  buildCharacterSheetPrompt,
  buildStyleSheetPrompt,
  normalizeCharacterKind,
  normalizeSheetProvider,
} from "./sheets.js";
import {
  deleteCharacter,
  deleteVisualStyle,
  listCharacters,
  listVisualStyles,
  parseCharacterBundle,
  parseStyleBundle,
  upsertCharacter,
  upsertVisualStyle,
} from "./store.js";

function fail(reply: { status: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const code = msg.includes("no encontrado") ? 404 : 400;
  return reply.status(code).send({ error: msg });
}

export async function registerLibraryRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/library/characters", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    return { characters: listCharacters(request.user!.id) };
  });

  app.post("/api/v1/library/characters", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    try {
      const body = parseCharacterBundle(request.body ?? {});
      return { character: upsertCharacter(request.user!.id, body) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.patch("/api/v1/library/characters/:id", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const body = { ...parseCharacterBundle(request.body ?? {}), id };
      const existing = listCharacters(request.user!.id).find((c) => c.id === id);
      if (!existing) return reply.status(404).send({ error: "Personaje no encontrado" });
      return { character: upsertCharacter(request.user!.id, body) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete("/api/v1/library/characters/:id", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    const { id } = request.params as { id: string };
    if (!deleteCharacter(request.user!.id, id)) return reply.status(404).send({ error: "Personaje no encontrado" });
    return { ok: true };
  });

  app.get("/api/v1/library/styles", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    return {
      builtins: ATELIER_STYLES,
      styles: listVisualStyles(request.user!.id),
    };
  });

  app.post("/api/v1/library/styles", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    try {
      const body = parseStyleBundle(request.body ?? {});
      return { style: upsertVisualStyle(request.user!.id, body) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.patch("/api/v1/library/styles/:id", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    const { id } = request.params as { id: string };
    try {
      const existing = listVisualStyles(request.user!.id).find((s) => s.id === id);
      if (!existing) return reply.status(404).send({ error: "Estilo no encontrado" });
      const body = { ...parseStyleBundle(request.body ?? {}), id };
      return { style: upsertVisualStyle(request.user!.id, body) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.delete("/api/v1/library/styles/:id", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    const { id } = request.params as { id: string };
    if (!deleteVisualStyle(request.user!.id, id)) return reply.status(404).send({ error: "Estilo no encontrado" });
    return { ok: true };
  });

  app.post("/api/v1/library/sheets", async (request: AuthedRequest, reply) => {
    if (!requireUser(request, reply)) return;
    request.raw.setTimeout(180_000);
    reply.raw.setTimeout(180_000);
    const body = (request.body ?? {}) as {
      type?: string;
      provider?: string;
      character?: Record<string, unknown>;
      style?: Record<string, unknown>;
    };
    const provider = normalizeSheetProvider(body.provider);
    let prompt = "";
    try {
      if (body.type === "style") {
        const s = body.style ?? {};
        const name = typeof s.name === "string" ? s.name.trim() : "";
        const artStyle = typeof s.artStyle === "string" ? s.artStyle.trim() : "";
        if (name.length < 2 || artStyle.length < 8) {
          return reply.status(400).send({ error: "El estilo necesita nombre y descripción visual" });
        }
        prompt = buildStyleSheetPrompt({
          name,
          artStyle,
          lighting: typeof s.lighting === "string" ? s.lighting : undefined,
          palette: typeof s.palette === "string" ? s.palette : undefined,
          notes: typeof s.notes === "string" ? s.notes : undefined,
        });
      } else {
        const c = body.character ?? {};
        const name = typeof c.name === "string" ? c.name.trim() : "";
        const appearance = typeof c.appearance === "string" ? c.appearance.trim() : "";
        const kind = normalizeCharacterKind(c.kind);
        let species = typeof c.species === "string" ? c.species.trim() : "";
        if (kind === "human" && species.length < 2) species = "humano";
        if (name.length < 2 || appearance.length < 8 || species.length < 2) {
          return reply.status(400).send({ error: "Nombre, especie y apariencia son obligatorios para la ficha" });
        }
        prompt = buildCharacterSheetPrompt({
          name,
          kind,
          species,
          age: typeof c.age === "string" ? c.age : undefined,
          sex: typeof c.sex === "string" ? c.sex : undefined,
          appearance,
          personality: typeof c.personality === "string" ? c.personality : undefined,
          wardrobe: typeof c.wardrobe === "string" ? c.wardrobe : undefined,
          mustKeep: typeof c.mustKeep === "string" ? c.mustKeep : undefined,
          mustAvoid: typeof c.mustAvoid === "string" ? c.mustAvoid : undefined,
          notes: typeof c.notes === "string" ? c.notes : undefined,
        });
      }

      const imageGen = createSheetImageGen(provider);
      const start = Date.now();
      const buffer = await imageGen.generate(prompt, undefined, undefined, "16:9");
      return {
        imageBase64: buffer.toString("base64"),
        prompt,
        provider,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: msg });
    }
  });
}

function createSheetImageGen(provider: string) {
  switch (provider) {
    case "openai":
      return new OpenAIImage();
    case "grok":
      return new GrokImage();
    case "gemini":
      return new GeminiImage();
    case "alicloud":
      return new AliCloudImage();
    case "runpod":
      return new RunPodImage();
    case "fal":
      return new FalImage();
    default:
      return new ViviImage();
  }
}
