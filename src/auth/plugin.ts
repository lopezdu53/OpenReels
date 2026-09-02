import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type IORedis from "ioredis";
import { countPublicationsOn, listSocialPublic } from "../publish/accounts.js";
import { countByDay, listUserJobs, streakDays } from "./jobs.js";
import {
  cookieHeader,
  createSessionId,
  deleteSession,
  getSession,
  putSession,
  readCookie,
  SESSION_COOKIE,
} from "./session.js";
import {
  authenticate,
  createUser,
  ensureSuperadmin,
  getUserById,
  isAdmin,
  listUsers,
  type PublicUser,
  type StoredCloneChannel,
  type StoredCloneContent,
  saveUser,
  setUserPassword,
  toAdminRow,
  todayKey,
  toPublic,
  type UserRecord,
  updateUser,
} from "./store.js";

export interface AuthedRequest extends FastifyRequest {
  user?: PublicUser;
  userRecord?: UserRecord;
}

function setSid(reply: FastifyReply, sid: string | null): void {
  reply.header("Set-Cookie", cookieHeader(sid ?? "", sid == null));
}

function requireAdmin(request: AuthedRequest, reply: FastifyReply): UserRecord | null {
  if (!request.userRecord || !isAdmin(request.userRecord)) {
    reply.status(403).send({ error: "Solo el superadmin puede hacer esto" });
    return null;
  }
  return request.userRecord;
}

export async function registerAuth(app: FastifyInstance, redis: IORedis | null): Promise<void> {
  await ensureSuperadmin().catch((err) => {
    app.log.warn({ err }, "ensureSuperadmin failed");
  });

  app.addHook("onRequest", async (request: AuthedRequest) => {
    const sid = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (!sid) return;
    const userId = await getSession(redis, sid);
    if (!userId) return;
    const record = getUserById(userId);
    if (!record) return;
    request.user = toPublic(record);
    request.userRecord = record;
  });

  app.post("/api/v1/auth/register", async (request, reply) => {
    const body = (request.body ?? {}) as { email?: string; name?: string; password?: string };
    try {
      const user = await createUser({
        email: body.email ?? "",
        name: body.name ?? "",
        password: body.password ?? "",
      });
      const sid = createSessionId();
      await putSession(redis, sid, user.id);
      setSid(reply, sid);
      return { user: toPublic(user) };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const body = (request.body ?? {}) as { email?: string; password?: string };
    const user = await authenticate(body.email ?? "", body.password ?? "");
    if (!user) {
      reply.status(401);
      return { error: "Email o contraseña incorrectos" };
    }
    const sid = createSessionId();
    await putSession(redis, sid, user.id);
    setSid(reply, sid);
    return { user: toPublic(user) };
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    const sid = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (sid) await deleteSession(redis, sid);
    setSid(reply, null);
    return { ok: true };
  });

  app.get("/api/v1/auth/me", async (request: AuthedRequest, reply) => {
    if (!request.user) return reply.status(401).send({ error: "Inicia sesión" });
    return { user: request.user };
  });

  app.get("/api/v1/learning/ypp", async () => ({
    ...YPP,
    countdown: countdownToYpp(),
    source:
      "https://blog.youtube/news-and-events/youtube-partner-program-updates-2027-new-opportunities-earn/",
    announced: "2026-08-10",
    changeDate: "2027-02-01",
  }));

  app.get("/api/v1/me/library", async (request: AuthedRequest, reply) => {
    const record = request.userRecord;
    if (!record) return reply.status(401).send({ error: "Inicia sesión" });
    return {
      user: toPublic(record),
      clonedChannels: record.clonedChannels,
      clonedVideos: record.clonedVideos,
      checkins: record.checkins,
      countdown: countdownToYpp(),
    };
  });

  app.get("/api/v1/me/dashboard", async (request: AuthedRequest, reply) => {
    const record = request.userRecord;
    if (!record) return reply.status(401).send({ error: "Inicia sesión" });
    const jobs = await listUserJobs(record.id);
    const week = countByDay(jobs, 7);
    const today = week[week.length - 1];
    const generatedToday = today?.generated ?? 0;
    const socialPosted = countPublicationsOn(record.id, todayKey());
    const posted = Math.max(record.checkins[todayKey()] ?? 0, socialPosted);
    const progress = Math.min(record.dailyGoal, posted);
    const completed = jobs.filter((j) => j.status === "completed");
    const weekRows = week.map((d) => {
      const postedDay = Math.max(
        record.checkins[d.date] ?? 0,
        countPublicationsOn(record.id, d.date),
      );
      return {
        ...d,
        posted: postedDay,
        hit: postedDay >= record.dailyGoal,
      };
    });
    return {
      user: toPublic(record),
      dailyGoal: record.dailyGoal,
      today: {
        date: todayKey(),
        generated: generatedToday,
        posted,
        progress,
        goal: record.dailyGoal,
      },
      week: weekRows,
      streak: streakDays(
        weekRows.map((d) => ({ date: d.date, generated: d.posted })),
        {},
        record.dailyGoal,
      ),
      social: listSocialPublic(record.id),
      clonedChannels: record.clonedChannels,
      clonedVideos: record.clonedVideos.slice(0, 12),
      recentJobs: completed.slice(0, 8),
      totals: {
        videos: completed.length,
        clones: record.clonedChannels.length,
        scripts: record.clonedVideos.length,
      },
      countdown: countdownToYpp(),
    };
  });

  app.post("/api/v1/me/clones/channel", async (request: AuthedRequest, reply) => {
    const record = request.userRecord;
    if (!record) return reply.status(401).send({ error: "Inicia sesión" });
    const body = (request.body ?? {}) as Omit<StoredCloneChannel, "id" | "savedAt">;
    if (!body.channelName?.trim())
      return reply.status(400).send({ error: "channelName is required" });
    const row: StoredCloneChannel = {
      ...body,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      sourceChannel: body.sourceChannel ?? "",
      polishNotes: body.polishNotes ?? "",
      firstVideos: body.firstVideos ?? [],
      contentPillars: body.contentPillars ?? [],
    };
    record.clonedChannels = [row, ...record.clonedChannels].slice(0, 40);
    saveUser(record);
    return { cloned: row };
  });

  app.post("/api/v1/me/clones/content", async (request: AuthedRequest, reply) => {
    const record = request.userRecord;
    if (!record) return reply.status(401).send({ error: "Inicia sesión" });
    const body = (request.body ?? {}) as Omit<StoredCloneContent, "id" | "savedAt">;
    if (!body.script && !body.hook) return reply.status(400).send({ error: "content is required" });
    const empty = { title: "", description: "", hashtags: [] as string[] };
    const row: StoredCloneContent = {
      ...body,
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      savedAt: new Date().toISOString(),
      youtube: body.youtube ?? empty,
      tiktok: body.tiktok ?? empty,
      bilibili: body.bilibili ?? empty,
      facebook: body.facebook ?? empty,
    };
    record.clonedVideos = [row, ...record.clonedVideos].slice(0, 80);
    saveUser(record);
    return { cloned: row };
  });

  app.post("/api/v1/me/goal", async (request: AuthedRequest, reply) => {
    const record = request.userRecord;
    if (!record) return reply.status(401).send({ error: "Inicia sesión" });
    const { dailyGoal } = (request.body ?? {}) as { dailyGoal?: number };
    record.dailyGoal = Math.min(10, Math.max(1, Math.round(dailyGoal ?? 4)));
    saveUser(record);
    return { user: toPublic(record) };
  });

  app.post("/api/v1/me/checkin", async (request: AuthedRequest, reply) => {
    const record = request.userRecord;
    if (!record) return reply.status(401).send({ error: "Inicia sesión" });
    const day = todayKey();
    const current = record.checkins[day] ?? 0;
    record.checkins[day] = Math.min(record.dailyGoal, current + 1);
    saveUser(record);
    return { date: day, count: record.checkins[day], dailyGoal: record.dailyGoal };
  });

  app.get("/api/v1/admin/users", async (request: AuthedRequest, reply) => {
    if (!requireAdmin(request, reply)) return;
    return { users: listUsers().map(toAdminRow) };
  });

  app.patch("/api/v1/admin/users/:id", async (request: AuthedRequest, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as {
      name?: string;
      email?: string;
      dailyGoal?: number;
      role?: "admin" | "user";
    };
    try {
      const user = await updateUser(id, body);
      return { user: toAdminRow(user) };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  app.post("/api/v1/admin/users/:id/password", async (request: AuthedRequest, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { id } = request.params as { id: string };
    const { password } = (request.body ?? {}) as { password?: string };
    try {
      const user = await setUserPassword(id, password ?? "");
      return { user: toAdminRow(user) };
    } catch (err) {
      reply.status(400);
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });
}

export function requireUser(request: AuthedRequest, reply: FastifyReply): PublicUser | null {
  if (!request.user) {
    reply.status(401).send({ error: "Inicia sesión para continuar" });
    return null;
  }
  return request.user;
}
