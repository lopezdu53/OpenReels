import type { FastifyInstance, FastifyReply } from "fastify";
import type IORedis from "ioredis";
import type { AuthedRequest } from "../auth/plugin.js";
import { disconnectAccount, listSocialPublic, saveAccount, setAutoPublish } from "./accounts.js";
import { buildAuthorizeUrl, exchangeCode, takeOauthState } from "./oauth.js";
import { publishJobToPlatforms } from "./run.js";
import { isSocialPlatform, SOCIAL_PLATFORMS, type SocialPlatform } from "./types.js";

function popupHtml(ok: boolean, platform: string, error?: string): string {
  const payload = JSON.stringify({ type: "openreels-oauth", ok, platform, error: error ?? null });
  return `<!doctype html><meta charset="utf-8"><title>OpenReels</title>
<body style="font-family:system-ui;padding:24px;background:#0b0b0f;color:#eee">
<p>${ok ? "Conectado. Ya puedes cerrar esta ventana." : (error ?? "Error")}</p>
<script>
try { window.opener && window.opener.postMessage(${payload}, "*"); } catch (e) {}
setTimeout(function(){ window.close(); }, 800);
</script>
</body>`;
}

export async function registerSocial(app: FastifyInstance, redis: IORedis | null): Promise<void> {
  app.get("/api/v1/me/social", async (request: AuthedRequest, reply: FastifyReply) => {
    if (!request.user) return reply.status(401).send({ error: "Inicia sesión" });
    return { platforms: listSocialPublic(request.user.id) };
  });

  app.get(
    "/api/v1/me/social/:platform/connect",
    async (request: AuthedRequest, reply: FastifyReply) => {
      if (!request.user) return reply.status(401).send({ error: "Inicia sesión" });
      const { platform } = request.params as { platform: string };
      if (!isSocialPlatform(platform) || platform === "bilibili") {
        return reply.status(400).send({ error: "Esa red no usa OAuth aquí" });
      }
      try {
        const url = await buildAuthorizeUrl(redis, platform, request.user.id);
        return { url };
      } catch (err) {
        reply.status(400);
        return { error: err instanceof Error ? err.message : String(err) };
      }
    },
  );

  app.post("/api/v1/me/social/bilibili", async (request: AuthedRequest, reply: FastifyReply) => {
    if (!request.user) return reply.status(401).send({ error: "Inicia sesión" });
    const body = (request.body ?? {}) as { sessdata?: string; biliJct?: string; handle?: string };
    if (!body.sessdata?.trim() || !body.biliJct?.trim()) {
      return reply.status(400).send({ error: "SESSDATA y bili_jct son obligatorios" });
    }
    saveAccount(request.user.id, "bilibili", {
      autoPublish: true,
      handle: body.handle?.trim() || "bilibili",
      extra: { sessdata: body.sessdata.trim(), biliJct: body.biliJct.trim() },
      connectedAt: new Date().toISOString(),
    });
    return { platforms: listSocialPublic(request.user.id) };
  });

  app.patch("/api/v1/me/social/:platform", async (request: AuthedRequest, reply: FastifyReply) => {
    if (!request.user) return reply.status(401).send({ error: "Inicia sesión" });
    const { platform } = request.params as { platform: string };
    if (!isSocialPlatform(platform)) return reply.status(400).send({ error: "Red desconocida" });
    const { autoPublish } = (request.body ?? {}) as { autoPublish?: boolean };
    try {
      if (autoPublish != null) setAutoPublish(request.user.id, platform, autoPublish);
      return { platforms: listSocialPublic(request.user.id) };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.delete("/api/v1/me/social/:platform", async (request: AuthedRequest, reply: FastifyReply) => {
    if (!request.user) return reply.status(401).send({ error: "Inicia sesión" });
    const { platform } = request.params as { platform: string };
    if (!isSocialPlatform(platform)) return reply.status(400).send({ error: "Red desconocida" });
    disconnectAccount(request.user.id, platform);
    return { platforms: listSocialPublic(request.user.id) };
  });

  app.post("/api/v1/me/jobs/:id/publish", async (request: AuthedRequest, reply: FastifyReply) => {
    if (!request.user) return reply.status(401).send({ error: "Inicia sesión" });
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { platforms?: string[] };
    const platforms = (body.platforms ?? []).filter(isSocialPlatform);
    try {
      const results = await publishJobToPlatforms({
        jobId: id,
        userId: request.user.id,
        platforms: platforms.length ? platforms : undefined,
      });
      return { results, platforms: listSocialPublic(request.user.id) };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.get("/api/v1/oauth/:platform/callback", async (request, reply) => {
    return finishOauthCallback(redis, request.params as { platform: string }, request.query, reply);
  });
}

async function finishOauthCallback(
  redis: IORedis | null,
  params: { platform: string },
  query: unknown,
  reply: FastifyReply,
) {
  const { platform } = params;
  const q = query as { code?: string; state?: string; error?: string };
  if (!isSocialPlatform(platform)) {
    return reply.status(400).send(popupHtml(false, platform, "Red desconocida"));
  }
  if (q.error) return reply.type("text/html").send(popupHtml(false, platform, q.error));
  const st = q.state ? await takeOauthState(redis, q.state) : null;
  if (!st || st.platform !== platform || !q.code) {
    return reply.type("text/html").send(popupHtml(false, platform, "Sesión OAuth caducada. Reintenta."));
  }
  try {
    const tokens = await exchangeCode(platform, q.code, st.verifier);
    saveAccount(st.userId, platform, {
      autoPublish: true,
      handle: tokens.handle,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      extra: tokens.extra,
      connectedAt: new Date().toISOString(),
    });
    return reply.type("text/html").send(popupHtml(true, platform));
  } catch (err) {
    return reply
      .type("text/html")
      .send(popupHtml(false, platform, err instanceof Error ? err.message : String(err)));
  }
}

export { SOCIAL_PLATFORMS, type SocialPlatform };
