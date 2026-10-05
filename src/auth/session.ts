import { randomBytes } from "node:crypto";
import type IORedis from "ioredis";

const TTL_SEC = 30 * 24 * 60 * 60;
const PREFIX = "openreels:sess:";
const memory = new Map<string, { userId: string; exp: number }>();

export function createSessionId(): string {
  return randomBytes(24).toString("hex");
}

export async function putSession(
  redis: IORedis | null,
  sid: string,
  userId: string,
): Promise<void> {
  memory.set(sid, { userId, exp: Date.now() + TTL_SEC * 1000 });
  if (!redis) return;
  try {
    await redis.set(`${PREFIX}${sid}`, userId, "EX", TTL_SEC);
  } catch {
    /* memory fallback */
  }
}

export async function getSession(redis: IORedis | null, sid: string): Promise<string | null> {
  if (redis) {
    try {
      const v = await redis.get(`${PREFIX}${sid}`);
      if (v) return v;
    } catch {
      /* fall through */
    }
  }
  const row = memory.get(sid);
  if (!row) return null;
  if (row.exp < Date.now()) {
    memory.delete(sid);
    return null;
  }
  return row.userId;
}

export async function deleteSession(redis: IORedis | null, sid: string): Promise<void> {
  memory.delete(sid);
  if (!redis) return;
  try {
    await redis.del(`${PREFIX}${sid}`);
  } catch {
    /* ignore */
  }
}

export const SESSION_COOKIE = "or_sid";
export const SESSION_MAX_AGE = TTL_SEC;

export function cookieHeader(sid: string, clear = false): string {
  if (clear) return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  return `${SESSION_COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}
