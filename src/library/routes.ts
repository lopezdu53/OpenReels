import type { FastifyInstance } from "fastify";
import { ATELIER_STYLES } from "../config/atelier-styles.js";
import type { AuthedRequest } from "../auth/plugin.js";
import { requireUser } from "../auth/plugin.js";
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
}
