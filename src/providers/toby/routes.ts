import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { tobyAgentToken, tobyReady } from "./catalog.js";
import { resetTobyPipeline } from "./generate.js";
import {
  completeTobyFifo,
  completeTobyResult,
  getTobyPublicAsset,
  listTobyPending,
  type TobyInboxResult,
} from "./inbox.js";

function bearerOk(header: string | undefined, expected: string): boolean {
  const got = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

function requireAgent(request: { headers: { authorization?: string } }, reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  const expected = tobyAgentToken();
  if (!expected) {
    return reply.status(503).send({
      ok: false,
      error: "TOBY_MCP_TOKEN / TOBY_AGENT_TOKEN no está en video + video-worker.",
    });
  }
  if (!bearerOk(request.headers.authorization, expected)) {
    return reply.status(401).send({ ok: false, error: "Token inválido" });
  }
  return null;
}

export async function registerTobyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/toby/status", async () => ({
    ok: true,
    ready: tobyReady(),
    pending: (await listTobyPending()).length,
  }));

  app.post("/api/v1/toby/reset", async () => {
    await resetTobyPipeline("reset desde Lab");
    return { ok: true, ready: tobyReady(), pending: (await listTobyPending()).length };
  });

  app.get("/api/v1/toby/public/:id", async (request, reply) => {
    const id = String((request.params as { id: string }).id ?? "").trim();
    const asset = id ? await getTobyPublicAsset(id) : null;
    if (!asset || asset.bytes.length < 32) return reply.status(404).send({ error: "not found" });
    return reply.type(asset.mime).send(asset.bytes);
  });

  app.get("/api/v1/toby/pending", async (request, reply) => {
    const denied = requireAgent(request, reply);
    if (denied) return denied;
    return { ok: true, jobs: await listTobyPending() };
  });

  async function applyInbox(
    request: { body: unknown },
    reply: { status: (n: number) => { send: (b: unknown) => unknown } },
    allowExplicitId: boolean,
  ) {
    const body = request.body as TobyInboxResult & {
      id?: string;
      kind?: "image" | "video";
      png?: string;
      mp4?: string;
    };
    const bytes = body.bytes ?? body.png ?? body.mp4;
    const result: TobyInboxResult = {
      ok: body.ok !== false,
      bytes,
      mime: body.mime,
      filename: body.filename,
      error: body.error,
    };
    const id = allowExplicitId ? String(body.id ?? "").trim() : "";
    if (id) {
      await completeTobyResult(id, result);
      return { ok: true, id };
    }
    const kind = body.kind === "video" ? "video" : "image";
    const matched = await completeTobyFifo(kind, result);
    if (!matched) return reply.status(409).send({ ok: false, error: "No hay trabajo Toby pendiente" });
    return { ok: true, id: matched };
  }

  app.post(
    "/api/v1/toby/inbox",
    { bodyLimit: 80 * 1024 * 1024 },
    async (request, reply) => {
      const denied = requireAgent(request, reply);
      if (denied) return denied;
      return applyInbox(request, reply, true);
    },
  );

  /** Studio Lab: Flow already saved the file on Windows — attach it here. */
  app.post(
    "/api/v1/toby/catch",
    { bodyLimit: 80 * 1024 * 1024 },
    async (request, reply) => {
      if ((await listTobyPending()).length < 1) {
        return reply.status(409).send({ ok: false, error: "No hay trabajo Toby pendiente" });
      }
      return applyInbox(request, reply, false);
    },
  );
}
