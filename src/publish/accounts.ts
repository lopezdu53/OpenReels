import { randomBytes } from "node:crypto";
import { getUserById, saveUser, todayKey } from "../auth/store.js";
import {
  oauthReady,
  SOCIAL_PLATFORMS,
  type SocialAccount,
  type SocialPlatform,
  type SocialPublic,
  type SocialPublication,
} from "./types.js";

export function accountOf(userId: string, platform: SocialPlatform): SocialAccount | undefined {
  return getUserById(userId)?.social?.[platform];
}

export function connected(acc: SocialAccount | undefined): boolean {
  if (!acc) return false;
  if (acc.extra?.["sessdata"]) return true;
  return Boolean(acc.accessToken);
}

function publicationsOf(
  user: ReturnType<typeof getUserById>,
): SocialPublication[] {
  const rows = user?.publications;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (p): p is SocialPublication =>
      Boolean(p && typeof p === "object" && typeof p.platform === "string"),
  );
}

export function listSocialPublic(userId: string): SocialPublic[] {
  const user = getUserById(userId);
  const today = todayKey();
  const pubs = publicationsOf(user);
  return SOCIAL_PLATFORMS.map((platform) => {
    const acc = user?.social?.[platform];
    return {
      platform,
      connected: connected(acc),
      autoPublish: acc?.autoPublish !== false && connected(acc),
      handle: acc?.handle,
      lastError: acc?.lastError,
      lastPublishedAt: acc?.lastPublishedAt,
      lastUrl: acc?.lastUrl,
      publishedToday: pubs.some(
        (p) =>
          p.platform === platform &&
          p.status === "ok" &&
          typeof p.at === "string" &&
          p.at.startsWith(today),
      ),
      oauthReady: oauthReady(platform),
    };
  });
}

export function countPublicationsOn(userId: string, date: string): number {
  const user = getUserById(userId);
  const seen = new Set<string>();
  for (const p of publicationsOf(user)) {
    if (p.status !== "ok" || typeof p.at !== "string" || !p.at.startsWith(date)) continue;
    const key = `${p.jobId}:${p.platform}`;
    if (seen.has(key)) continue;
    seen.add(key);
  }
  return seen.size;
}

export function saveAccount(userId: string, platform: SocialPlatform, acc: SocialAccount): void {
  const user = getUserById(userId);
  if (!user) throw new Error("Usuario no encontrado");
  user.social = { ...user.social, [platform]: acc };
  saveUser(user);
}

export function disconnectAccount(userId: string, platform: SocialPlatform): void {
  const user = getUserById(userId);
  if (!user) throw new Error("Usuario no encontrado");
  if (!user.social) return;
  delete user.social[platform];
  saveUser(user);
}

export function setAutoPublish(
  userId: string,
  platform: SocialPlatform,
  autoPublish: boolean,
): void {
  const user = getUserById(userId);
  if (!user) throw new Error("Usuario no encontrado");
  const acc = user.social?.[platform];
  if (!acc || !connected(acc)) throw new Error("Conecta la cuenta primero");
  acc.autoPublish = autoPublish;
  user.social = { ...user.social, [platform]: acc };
  saveUser(user);
}

export function alreadyPublished(userId: string, jobId: string, platform: SocialPlatform): boolean {
  const user = getUserById(userId);
  return Boolean(
    user?.publications?.some(
      (p) => p.jobId === jobId && p.platform === platform && p.status === "ok",
    ),
  );
}

export function recordSocialPublish(opts: {
  userId: string;
  jobId: string;
  platform: SocialPlatform;
  url?: string;
  error?: string;
}): SocialPublication {
  const user = getUserById(opts.userId);
  if (!user) throw new Error("Usuario no encontrado");
  if (!opts.error && alreadyPublished(opts.userId, opts.jobId, opts.platform)) {
    const existing = user.publications?.find(
      (p) => p.jobId === opts.jobId && p.platform === opts.platform && p.status === "ok",
    );
    if (existing) return existing;
  }
  const at = new Date().toISOString();
  const pub: SocialPublication = {
    id: randomBytes(8).toString("hex"),
    jobId: opts.jobId,
    platform: opts.platform,
    url: opts.url,
    status: opts.error ? "error" : "ok",
    error: opts.error,
    at,
  };
  user.publications = [pub, ...(user.publications ?? [])].slice(0, 250);
  const acc = user.social?.[opts.platform] ?? { autoPublish: true };
  if (opts.error) {
    acc.lastError = opts.error;
  } else {
    acc.lastError = undefined;
    acc.lastPublishedAt = at;
    acc.lastUrl = opts.url;
    if (
      !user.publications.some(
        (p) =>
          p !== pub && p.jobId === opts.jobId && p.platform === opts.platform && p.status === "ok",
      )
    ) {
      const day = todayKey();
      user.checkins = user.checkins ?? {};
      user.checkins[day] = (user.checkins[day] ?? 0) + 1;
    }
  }
  user.social = { ...user.social, [opts.platform]: acc };
  saveUser(user);
  return pub;
}

export function platformsToAutoPublish(userId: string): SocialPlatform[] {
  const user = getUserById(userId);
  if (!user) return [];
  return SOCIAL_PLATFORMS.filter((p) => {
    const acc = user.social?.[p];
    return connected(acc) && acc?.autoPublish !== false;
  });
}
