import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import type IORedis from "ioredis";
import type { VoxBeatsDoc, VoxJobConfig, VoxJobMeta, VoxStatus } from "./types.js";

const SNAP_TTL_SEC = 7 * 24 * 60 * 60;

function openReelsJobsDir(): string {
  return process.env["JOBS_DIR"] ?? path.join(process.cwd(), "jobs");
}

function samePath(a: string, b: string): boolean {
  return path.resolve(a) === path.resolve(b);
}

/**
 * Vox jobs live as `$JOBS_DIR/vox-<id>` on the volume EasyPanel already shares.
 * Never use `$JOBS_DIR/vox` as the root: a separate volume mounted there hides
 * the real folder from the other container (the current prod failure).
 */
export function voxJobsDir(): string {
  const jobs = openReelsJobsDir();
  const nested = path.join(jobs, "vox");
  const configured = process.env["VOX_JOBS_DIR"];
  if (configured && !samePath(configured, nested)) return configured;
  return jobs;
}

/** `jobs/vox` and `jobs/vox-*` must never be listed or pruned as Short/Film jobs. */
export function isVoxSharedVolumeEntry(name: string): boolean {
  return name === "vox" || isVoxJobId(name);
}

export function voxSnapshotKey(id: string): string {
  return `vox:snap:${id}`;
}

function extraLookupRoots(): string[] {
  const jobs = openReelsJobsDir();
  return [path.join(jobs, "vox"), path.join(process.cwd(), "vox-jobs"), "/app/vox-jobs"];
}

function jobDirCandidates(id: string): string[] {
  const roots = [voxJobsDir(), ...extraLookupRoots()];
  return [...new Set(roots.map((root) => path.join(root, id)))];
}

function legacyVoxDirs(): string[] {
  const dest = voxJobsDir();
  return [...new Set(extraLookupRoots().filter((dir) => !samePath(dir, dest) && fs.existsSync(dir)))];
}

function copyJobIfMissing(from: string, to: string, name: string): boolean {
  if (!fs.existsSync(path.join(from, "meta.json")) || fs.existsSync(path.join(to, "meta.json"))) return false;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
  console.log(`[vox] migrated ${name} from ${from} → ${to}`);
  return true;
}

/** Copy leftover jobs from isolated /app/vox-jobs or a nested jobs/vox mount onto $JOBS_DIR. */
export function migrateLegacyVoxJobs(): number {
  const destRoot = voxJobsDir();
  fs.mkdirSync(destRoot, { recursive: true });
  let copied = 0;
  for (const src of legacyVoxDirs()) {
    for (const name of fs.readdirSync(src)) {
      if (!isVoxJobId(name)) continue;
      const from = path.join(src, name);
      if (!fs.statSync(from).isDirectory()) continue;
      if (copyJobIfMissing(from, path.join(destRoot, name), name)) copied += 1;
    }
  }
  return copied;
}

export function voxRoot(): string {
  return path.join(process.cwd(), "vox");
}

export function isVoxJobId(id: string): boolean {
  return /^vox-[\w]+$/.test(id);
}

export function newVoxId(): string {
  return `vox-${randomBytes(4).toString("hex")}`;
}

export function jobDir(id: string): string {
  for (const dir of jobDirCandidates(id)) {
    if (fs.existsSync(path.join(dir, "meta.json"))) return dir;
  }
  return path.join(voxJobsDir(), id);
}

function metaPath(id: string): string {
  return path.join(jobDir(id), "meta.json");
}

function beatsPath(id: string): string {
  return path.join(jobDir(id), "beats.json");
}

export function ensureVoxJobsDir(): void {
  migrateLegacyVoxJobs();
  fs.mkdirSync(voxJobsDir(), { recursive: true });
}

export function writeMeta(meta: VoxJobMeta): void {
  fs.mkdirSync(jobDir(meta.id), { recursive: true });
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2));
}

export function readMeta(id: string): VoxJobMeta | null {
  if (!isVoxJobId(id)) return null;
  const p = metaPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as VoxJobMeta;
}

export function writeBeats(id: string, doc: VoxBeatsDoc): void {
  fs.mkdirSync(jobDir(id), { recursive: true });
  fs.writeFileSync(beatsPath(id), JSON.stringify(doc, null, 2));
}

export function readBeats(id: string): VoxBeatsDoc | null {
  const p = beatsPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as VoxBeatsDoc;
}

export function createJob(userId: string, config: VoxJobConfig): VoxJobMeta {
  ensureVoxJobsDir();
  const id = newVoxId();
  const now = new Date().toISOString();
  const meta: VoxJobMeta = {
    id,
    kind: "vox",
    userId,
    topic: config.topic,
    status: "drafting",
    stage: "beats",
    detail: "Redactando beat map",
    createdAt: now,
    updatedAt: now,
    config,
  };
  writeMeta(meta);
  return meta;
}

export function patchMeta(id: string, patch: Partial<VoxJobMeta>): VoxJobMeta {
  const cur = readMeta(id);
  if (!cur) throw new Error("Vox job not found");
  const next = { ...cur, ...patch };
  writeMeta(next);
  return next;
}

export function setStatus(id: string, status: VoxStatus, stage: string, detail: string, extra?: Partial<VoxJobMeta>): VoxJobMeta {
  return patchMeta(id, { status, stage, detail, ...extra });
}

export function listJobs(userId: string, limit = 30): VoxJobMeta[] {
  ensureVoxJobsDir();
  const seen = new Set<string>();
  const metas: VoxJobMeta[] = [];
  for (const root of [voxJobsDir(), ...extraLookupRoots()]) {
    if (!fs.existsSync(root)) continue;
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory() || !isVoxJobId(d.name) || seen.has(d.name)) continue;
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
  const payload = { meta, beats: readBeats(id) };
  await redis.set(voxSnapshotKey(id), JSON.stringify(payload), "EX", SNAP_TTL_SEC);
}

export async function hydrateJobFromSnapshot(redis: IORedis, id: string): Promise<boolean> {
  if (readMeta(id)) return true;
  const raw = await redis.get(voxSnapshotKey(id));
  if (!raw) return false;
  const snap = JSON.parse(raw) as { meta: VoxJobMeta; beats: VoxBeatsDoc | null };
  if (!snap?.meta?.id) return false;
  writeMeta(snap.meta);
  if (snap.beats) writeBeats(id, snap.beats);
  console.log(`[vox] hydrated ${id} from Redis → ${jobDir(id)}`);
  return true;
}

export function bakeoffFiles(id: string): string[] {
  const dir = path.join(jobDir(id), "style-bakeoff");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
}

export function finalPath(id: string): string | null {
  const p = path.join(jobDir(id), "final.mp4");
  return fs.existsSync(p) ? p : null;
}

export function writeUpload(id: string, name: string, dataUrl: string): string {
  const dir = path.join(jobDir(id), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) throw new Error("Archivo inválido (se espera data URL)");
  const ext = m[1]!.includes("png") ? "png" : m[1]!.includes("jpeg") || m[1]!.includes("jpg") ? "jpg" : m[1]!.includes("mp4") ? "mp4" : m[1]!.includes("webm") ? "webm" : "bin";
  const dest = path.join(dir, `${name}.${ext}`);
  fs.writeFileSync(dest, Buffer.from(m[2]!, "base64"));
  return dest;
}
