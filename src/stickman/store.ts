import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import type IORedis from "ioredis";
import { isStickmanJobDirName } from "../jobs/isolated.js";
import type { StickmanJobConfig, StickmanJobMeta, StickmanScript, StickmanStatus } from "./types.js";

const SNAP_TTL_SEC = 7 * 24 * 60 * 60;

function openReelsJobsDir(): string {
  return process.env["JOBS_DIR"] ?? path.join(process.cwd(), "jobs");
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

/**
 * Stickman jobs live as `$JOBS_DIR/stickman-<id>` on the volume EasyPanel already shares.
 * Never use `$JOBS_DIR/stickman` as the root: a separate volume mounted there hides
 * the real folder from the other container.
 */
export function stickmanJobsDir(): string {
  const jobs = openReelsJobsDir();
  const nested = path.join(jobs, "stickman");
  const configured = process.env["STICKMAN_JOBS_DIR"];
  if (configured && !samePath(configured, nested)) return configured;
  return jobs;
}

export function isStickmanSharedVolumeEntry(name: string): boolean {
  return name === "stickman" || isStickmanJobId(name);
}

export function stickmanSnapshotKey(id: string): string {
  return `stickman:snap:${id}`;
}

function extraLookupRoots(): string[] {
  const jobs = openReelsJobsDir();
  return [path.join(jobs, "stickman"), path.join(process.cwd(), "stickman-jobs"), "/app/stickman-jobs"];
}

function jobDirCandidates(id: string): string[] {
  const roots = [stickmanJobsDir(), ...extraLookupRoots()];
  return [...new Set(roots.map((root) => path.join(root, id)))];
}

export function isStickmanJobId(id: string): boolean {
  return isStickmanJobDirName(id);
}

export function newStickmanId(): string {
  return `stickman-${randomBytes(4).toString("hex")}`;
}

export function jobDir(id: string): string {
  for (const dir of jobDirCandidates(id)) {
    if (fs.existsSync(path.join(dir, "meta.json"))) return dir;
  }
  return path.join(stickmanJobsDir(), id);
}

function metaPath(id: string): string {
  return path.join(jobDir(id), "meta.json");
}

function scriptPath(id: string): string {
  return path.join(jobDir(id), "script.json");
}

export function ensureStickmanJobsDir(): void {
  fs.mkdirSync(stickmanJobsDir(), { recursive: true });
}

export function writeMeta(meta: StickmanJobMeta): void {
  fs.mkdirSync(jobDir(meta.id), { recursive: true });
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2));
}

export function readMeta(id: string): StickmanJobMeta | null {
  if (!isStickmanJobId(id)) return null;
  const p = metaPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as StickmanJobMeta;
}

export function writeScript(id: string, doc: StickmanScript): void {
  fs.mkdirSync(jobDir(id), { recursive: true });
  fs.writeFileSync(scriptPath(id), JSON.stringify(doc, null, 2));
}

export function readScript(id: string): StickmanScript | null {
  const p = scriptPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as StickmanScript;
}

export function createJob(userId: string, config: StickmanJobConfig): StickmanJobMeta {
  ensureStickmanJobsDir();
  const id = newStickmanId();
  const now = new Date().toISOString();
  const meta: StickmanJobMeta = {
    id,
    kind: "stickman",
    userId,
    topic: config.topic,
    status: "drafting",
    stage: "script",
    detail: "Escribiendo el guion de palitos",
    createdAt: now,
    updatedAt: now,
    config,
  };
  writeMeta(meta);
  return meta;
}

export function patchMeta(id: string, patch: Partial<StickmanJobMeta>): StickmanJobMeta {
  const cur = readMeta(id);
  if (!cur) throw new Error("Stickman job not found");
  const next = { ...cur, ...patch };
  writeMeta(next);
  return next;
}

export function setStatus(
  id: string,
  status: StickmanStatus,
  stage: string,
  detail: string,
  extra?: Partial<StickmanJobMeta>,
): StickmanJobMeta {
  return patchMeta(id, { status, stage, detail, ...extra });
}

export function listJobs(userId: string, limit = 30): StickmanJobMeta[] {
  ensureStickmanJobsDir();
  const seen = new Set<string>();
  const metas: StickmanJobMeta[] = [];
  for (const root of [stickmanJobsDir(), ...extraLookupRoots()]) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory() || !isStickmanJobId(d.name) || seen.has(d.name)) continue;
      const meta = readMeta(d.name);
      if (!meta || meta.userId !== userId) continue;
      seen.add(d.name);
      metas.push(meta);
    }
  }
  return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}

export async function saveJobSnapshot(redis: IORedis, id: string): Promise<void> {
  const meta = readMeta(id);
  if (!meta) return;
  const payload = { meta, script: readScript(id) };
  await redis.set(stickmanSnapshotKey(id), JSON.stringify(payload), "EX", SNAP_TTL_SEC);
}

export async function hydrateJobFromSnapshot(redis: IORedis, id: string): Promise<boolean> {
  if (readMeta(id)) return true;
  const raw = await redis.get(stickmanSnapshotKey(id));
  if (!raw) return false;
  const snap = JSON.parse(raw) as { meta: StickmanJobMeta; script: StickmanScript | null };
  if (!snap?.meta?.id) return false;
  writeMeta(snap.meta);
  if (snap.script) writeScript(id, snap.script);
  console.log(`[stickman] hydrated ${id} from Redis → ${jobDir(id)}`);
  return true;
}

export function stillFiles(id: string): string[] {
  const dir = path.join(jobDir(id), "stills");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
}

export function finalPath(id: string): string | null {
  const p = path.join(jobDir(id), "final.mp4");
  return fs.existsSync(p) ? p : null;
}
