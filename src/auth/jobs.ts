import * as fs from "node:fs";
import * as path from "node:path";
import pLimit from "p-limit";
import { todayKey } from "./store.js";

const JOBS_DIR = process.env["JOBS_DIR"] ?? path.join(process.cwd(), "jobs");

export interface JobMetaLite {
  id: string;
  topic?: string;
  status?: string;
  createdAt?: string;
  completedAt?: string;
  userId?: string;
  videoPath?: string;
}

function liteMeta(id: string, meta: JobMetaLite): JobMetaLite {
  return {
    id,
    topic: typeof meta.topic === "string" ? meta.topic : undefined,
    status: typeof meta.status === "string" ? meta.status : undefined,
    createdAt: typeof meta.createdAt === "string" ? meta.createdAt : undefined,
    completedAt: typeof meta.completedAt === "string" ? meta.completedAt : undefined,
    userId: typeof meta.userId === "string" ? meta.userId : undefined,
    videoPath: typeof meta.videoPath === "string" ? meta.videoPath : undefined,
  };
}

export async function listUserJobs(userId: string): Promise<JobMetaLite[]> {
  try {
    if (!fs.existsSync(JOBS_DIR)) return [];
    const stat = fs.statSync(JOBS_DIR);
    if (!stat.isDirectory()) return [];
    const dirs = fs.readdirSync(JOBS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
    const limit = pLimit(16);
    const entries = await Promise.all(
      dirs.map((d) =>
        limit(async () => {
          try {
            const raw = await fs.promises.readFile(path.join(JOBS_DIR, d.name, "meta.json"), "utf-8");
            const meta = JSON.parse(raw) as JobMetaLite;
            if (meta.userId !== userId) return null;
            return liteMeta(d.name, meta);
          } catch {
            return null;
          }
        }),
      ),
    );
    return entries
      .filter((m): m is JobMetaLite => Boolean(m))
      .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  } catch (err) {
    console.warn("[listUserJobs]", err);
    return [];
  }
}

export function countByDay(
  jobs: JobMetaLite[],
  days: number,
): { date: string; generated: number }[] {
  const out: { date: string; generated: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = todayKey(d);
    const generated = jobs.filter(
      (j) => (j.createdAt ?? "").slice(0, 10) === key && j.status === "completed",
    ).length;
    out.push({ date: key, generated });
  }
  return out;
}

export function streakDays(
  week: { date: string; generated: number }[],
  checkins: Record<string, number>,
  goal: number,
): number {
  let streak = 0;
  for (let i = week.length - 1; i >= 0; i--) {
    const row = week[i];
    if (!row) break;
    const total = row.generated + (checkins[row.date] ?? 0);
    if (total >= goal) streak++;
    else if (i === week.length - 1 && total === 0) continue;
    else break;
  }
  return streak;
}
