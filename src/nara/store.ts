import { randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { isNaraJobDirName } from "../jobs/isolated.js";
import type { NaraJobConfig, NaraJobMeta, NaraScriptDoc, NaraStatus } from "./types.js";

function openReelsJobsDir(): string {
  return process.env["JOBS_DIR"] ?? path.join(process.cwd(), "jobs");
}

export function naraJobsDir(): string {
  return openReelsJobsDir();
}

export function isNaraJobId(id: string): boolean {
  return isNaraJobDirName(id);
}

export function newNaraId(): string {
  return `nara-${randomBytes(4).toString("hex")}`;
}

export function jobDir(id: string): string {
  return path.join(naraJobsDir(), id);
}

function metaPath(id: string): string {
  return path.join(jobDir(id), "meta.json");
}

function scriptPath(id: string): string {
  return path.join(jobDir(id), "script.json");
}

export function ensureNaraJobsDir(): void {
  fs.mkdirSync(naraJobsDir(), { recursive: true });
}

export function writeMeta(meta: NaraJobMeta): void {
  fs.mkdirSync(jobDir(meta.id), { recursive: true });
  meta.updatedAt = new Date().toISOString();
  fs.writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2));
}

export function readMeta(id: string): NaraJobMeta | null {
  if (!isNaraJobId(id)) return null;
  const p = metaPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as NaraJobMeta;
}

export function writeScript(id: string, doc: NaraScriptDoc): void {
  fs.mkdirSync(jobDir(id), { recursive: true });
  fs.writeFileSync(scriptPath(id), JSON.stringify(doc, null, 2));
  fs.writeFileSync(path.join(jobDir(id), "guion.txt"), doc.script);
}

export function readScript(id: string): NaraScriptDoc | null {
  const p = scriptPath(id);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8")) as NaraScriptDoc;
}

export function mp3Path(id: string): string | null {
  const p = path.join(jobDir(id), "voice.mp3");
  return fs.existsSync(p) && fs.statSync(p).size > 200 ? p : null;
}

export function wavPath(id: string): string {
  return path.join(jobDir(id), "voice.wav");
}

export function createJob(userId: string, config: NaraJobConfig): NaraJobMeta {
  ensureNaraJobsDir();
  const id = newNaraId();
  const now = new Date().toISOString();
  const meta: NaraJobMeta = {
    id,
    userId,
    idea: config.idea,
    status: "queued",
    stage: "queue",
    detail: "En cola",
    createdAt: now,
    updatedAt: now,
    config,
  };
  writeMeta(meta);
  return meta;
}

export function patchMeta(id: string, patch: Partial<NaraJobMeta>): NaraJobMeta {
  const cur = readMeta(id);
  if (!cur) throw new Error("Nara job not found");
  const next = { ...cur, ...patch };
  writeMeta(next);
  return next;
}

export function setStatus(
  id: string,
  status: NaraStatus,
  stage: string,
  detail: string,
  extra?: Partial<NaraJobMeta>,
): NaraJobMeta {
  return patchMeta(id, { status, stage, detail, ...extra });
}

export function listJobs(userId: string, limit = 40): NaraJobMeta[] {
  ensureNaraJobsDir();
  const root = naraJobsDir();
  if (!fs.existsSync(root)) return [];
  const metas: NaraJobMeta[] = [];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || !isNaraJobId(d.name)) continue;
    const meta = readMeta(d.name);
    if (!meta || meta.userId !== userId) continue;
    metas.push({ ...meta, hasMp3: Boolean(mp3Path(meta.id)) });
  }
  return metas.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
