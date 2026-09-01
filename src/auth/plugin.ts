import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type IORedis from "ioredis";
import { countdownToYpp, YPP } from "../learning/ypp.js";
import { countByDay, listUserJobs, streakDays } from "./jobs.js";
import {
  cookieHeader,
  createSessionId,
  deleteSession,
  getSession,
  readCookie,
  SESSION_COOKIE,
  putSession,
} from "./session.js";
import {
  authenticate,
  createUser,
  getUserById,
  saveUser,
  todayKey,
  toPublic,
  type PublicUser,
  type StoredCloneChannel,
  type StoredCloneContent,
  type UserRecord,
} from "./store.js";

export interface AuthedRequest extends FastifyRequest {
  user?: PublicUser;
  userRecord?: UserRecord;
}

function setSid(reply: FastifyReply, sid: string | null): void {
  reply.header("Set-Cookie", cookieHeader(sid ?? "", sid == null));
}

export async function registerAuth(
  app: FastifyInstance,
  redis: IORedis | null,
): Promise<void> {
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
    source: "https://blog.youtube/news-and-events/youtube-partner-program-updates-2027-new-opportunities-earn/",
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
    const postedToday = record.checkins[todayKey()] ?? 0;
    const progress = Math.min(record.dailyGoal, generatedToday + postedToday);
    const completed = jobs.filter((j) => j.status === "completed");
    return {
      user: toPublic(record),
      dailyGoal: record.dailyGoal,
      today: {
        date: todayKey(),
        generated: generatedToday,
        posted: postedToday,
        progress,
        goal: record.dailyGoal,
      },
      week: week.map((d) => ({
        ...d,
        posted: record.checkins[d.date] ?? 0,
        hit: d.generated + (record.checkins[d.date] ?? 0) >= record.dailyGoal,
      })),
      streak: streakDays(week, record.checkins, record.dailyGoal),
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
    if (!body.channelName?.trim()) return reply.status(400).send({ error: "channelName is required" });
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
}

export function requireUser(request: AuthedRequest, reply: FastifyReply): PublicUser | null {
  if (!request.user) {
    reply.status(401).send({ error: "Inicia sesión para continuar" });
    return null;
  }
  return request.user;
}
