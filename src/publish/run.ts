import * as fs from "node:fs";
import * as path from "node:path";
import { getUserById } from "../auth/store.js";
import { alreadyPublished, platformsToAutoPublish, recordSocialPublish } from "./accounts.js";
import type { SocialPlatform } from "./types.js";
import { uploadToPlatform } from "./upload.js";

const JOBS_DIR = process.env["JOBS_DIR"] ?? path.join(process.cwd(), "jobs");

export function resolveVideoFile(jobDir: string, videoPath?: string): string | null {
  const candidates = [
    videoPath ? path.join(jobDir, videoPath) : "",
    path.join(jobDir, "final.mp4"),
    path.join(jobDir, "output", "final.mp4"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

export function captionFromMeta(meta: {
  topic?: string;
  tiktokCaption?: { title?: string; caption?: string };
}): { title: string; description: string } {
  const title = (meta.tiktokCaption?.title ?? meta.topic ?? "Short").slice(0, 100);
  const description = meta.tiktokCaption?.caption ?? meta.topic ?? title;
  return { title, description };
}

async function publishOne(
  userId: string,
  jobId: string,
  platform: SocialPlatform,
  file: string,
  title: string,
  description: string,
): Promise<{ platform: SocialPlatform; ok: boolean; url?: string; error?: string; rec?: unknown }> {
  if (alreadyPublished(userId, jobId, platform)) return { platform, ok: true };
  const user = getUserById(userId);
  const account = user?.social?.[platform];
  if (!account) return { platform, ok: false, error: "Cuenta no conectada" };
  try {
    const up = await uploadToPlatform(platform, { filePath: file, title, description, account });
    const rec = recordSocialPublish({ userId, jobId, platform, url: up.url });
    return { platform, ok: true, url: up.url, rec };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    recordSocialPublish({ userId, jobId, platform, error });
    return { platform, ok: false, error, rec: { platform, status: "error", error, at: new Date().toISOString() } };
  }
}

export async function publishJobToPlatforms(opts: {
  jobId: string;
  userId: string;
  platforms?: SocialPlatform[];
}): Promise<{ platform: SocialPlatform; ok: boolean; url?: string; error?: string }[]> {
  const jobDir = path.join(JOBS_DIR, opts.jobId);
  const metaPath = path.join(jobDir, "meta.json");
  if (!fs.existsSync(metaPath)) throw new Error("Job no encontrado");
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
    userId?: string;
    topic?: string;
    videoPath?: string;
    tiktokCaption?: { title?: string; caption?: string };
    publications?: unknown[];
  };
  if (meta.userId && meta.userId !== opts.userId) throw new Error("Ese video no es tuyo");
  const file = resolveVideoFile(jobDir, meta.videoPath);
  if (!file) throw new Error("El job no tiene final.mp4 todavía");
  if (!getUserById(opts.userId)) throw new Error("Usuario no encontrado");
  const { title, description } = captionFromMeta(meta);
  const targets = opts.platforms?.length ? opts.platforms : platformsToAutoPublish(opts.userId);
  const pubs: unknown[] = Array.isArray(meta.publications) ? [...meta.publications] : [];
  const results: { platform: SocialPlatform; ok: boolean; url?: string; error?: string }[] = [];
  for (const platform of targets) {
    const row = await publishOne(opts.userId, opts.jobId, platform, file, title, description);
    if (row.rec) pubs.push(row.rec);
    results.push({ platform: row.platform, ok: row.ok, url: row.url, error: row.error });
  }
  meta.publications = pubs.slice(-40);
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  return results;
}

export async function publishCompletedJob(jobId: string): Promise<void> {
  const metaPath = path.join(JOBS_DIR, jobId, "meta.json");
  if (!fs.existsSync(metaPath)) return;
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8")) as {
    userId?: string;
    videoPath?: string;
  };
  if (!meta.userId) return;
  const targets = platformsToAutoPublish(meta.userId);
  if (targets.length === 0) return;
  await publishJobToPlatforms({ jobId, userId: meta.userId, platforms: targets });
}
