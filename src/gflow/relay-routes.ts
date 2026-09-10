import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import {
  completeBridgeJob,
  isBridgeOnline,
  pollBridgeJob,
  queuedBridgeJobs,
  type GflowRelayResult,
} from "../providers/gflow/relay.js";

function bearerOk(header: string | undefined, expected: string): boolean {
  const got = header?.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!got || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function registerGflowBridgeRoutes(app: FastifyInstance): Promise<void> {
  const token = () => process.env["GFLOW_BRIDGE_TOKEN"]?.trim() ?? "";

  app.get("/api/v1/gflow/bridge/status", async (request, reply) => {
    const expected = token();
    if (!expected || !bearerOk(request.headers.authorization, expected)) {
      return reply.status(401).send({ ok: false, error: "Token inválido" });
    }
    const online = await isBridgeOnline();
    const queued = await queuedBridgeJobs();
    return { ok: true, online, queued };
  });

  app.post("/api/v1/gflow/bridge/poll", async (request, reply) => {
    const expected = token();
    if (!expected) {
      return reply.status(503).send({
        ok: false,
        error: "GFLOW_BRIDGE_TOKEN no está en el estudio. Pónlo en EasyPanel (video + worker).",
      });
    }
    if (!bearerOk(request.headers.authorization, expected)) {
      return reply.status(401).send({ ok: false, error: "Token inválido" });
    }
    const waitSec = Math.min(
      25,
      Math.max(5, Number((request.body as { waitSec?: number } | null)?.waitSec) || 20),
    );
    const job = await pollBridgeJob(waitSec);
    return { ok: true, job };
  });

  app.post(
    "/api/v1/gflow/bridge/result",
    { bodyLimit: 80 * 1024 * 1024 },
    async (request, reply) => {
      const expected = token();
      if (!expected || !bearerOk(request.headers.authorization, expected)) {
        return reply.status(401).send({ ok: false, error: "Token inválido" });
      }
      const body = request.body as GflowRelayResult & { id?: string };
      const id = String(body.id ?? "").trim();
      if (!id) return reply.status(400).send({ ok: false, error: "id requerido" });
      await completeBridgeJob(id, {
        ok: body.ok !== false,
        png: body.png,
        mp4: body.mp4,
        durationSeconds: body.durationSeconds,
        error: body.error,
      });
      return { ok: true };
    },
  );
}
