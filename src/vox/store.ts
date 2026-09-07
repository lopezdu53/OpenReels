import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import type { VoxBeatsDoc, VoxJobConfig, VoxJobMeta, VoxStatus } from "./types.js";

function openReelsJobsDir(): string {
  return process.env["JOBS_DIR"] ?? path.join(process.cwd(), "jobs");
}

/** EasyPanel already shares JOBS_DIR between API and worker. Keep Vox on that volume. */
export function voxJobsDir(): string {
  if (process.env["VOX_JOBS_DIR"]) return process.env["VOX_JOBS_DIR"];
  return path.join(openReelsJobsDir(), "vox");
}

/** `jobs/vox` (and stray `jobs/vox-*`) must never be listed or pruned as Short/Film jobs. */
export function isVoxSharedVolumeEntry(name: string): boolean {
  return name === "vox" || isVoxJobId(name);
}

function legacyVoxDirs(): string[] {
  const configured = voxJobsDir();
  const candidates = [path.join(process.cwd(), "vox-jobs"), "/app/vox-jobs"];
  return [...new Set(candidates.filter((dir) => dir !== configured && fs.existsSync(dir)))];
}

/** Copy leftover jobs from the old isolated /app/vox-jobs disk onto the shared volume. */
export function migrateLegacyVoxJobs(): number {
  const dest = voxJobsDir();
  fs.mkdirSync(dest, { recursive: true });
  let copied = 0;
  for (const src of legacyVoxDirs()) {
    for (const name of fs.readdirSync(src)) {
      if (!isVoxJobId(name)) continue;
      const from = path.join(src, name);
      const to = path.join(dest, name);
      if (!fs.statSync(from).isDirectory() || fs.existsSync(to)) continue;
      fs.cpSync(from, to, { recursive: true });
      copied += 1;
      console.log(`[vox] migrated ${name} from ${src} → ${dest}`);
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
  const root = voxJobsDir();
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isVoxJobId(d.name))
    .map((d) => readMeta(d.name))
    .filter((m): m is VoxJobMeta => Boolean(m && m.userId === userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
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
