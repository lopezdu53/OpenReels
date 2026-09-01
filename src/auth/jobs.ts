import * as fs from "node:fs";
import * as path from "node:path";
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

export async function listUserJobs(userId: string): Promise<JobMetaLite[]> {
  if (!fs.existsSync(JOBS_DIR)) return [];
  const dirs = fs.readdirSync(JOBS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
  const entries = await Promise.all(
    dirs.map(async (d) => {
      try {
        const raw = await fs.promises.readFile(path.join(JOBS_DIR, d.name, "meta.json"), "utf-8");
        const meta = JSON.parse(raw) as JobMetaLite;
        return { ...meta, id: d.name };
      } catch {
        return null;
      }
    }),
  );
  return entries
    .filter((m): m is JobMetaLite => Boolean(m && m.userId === userId))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
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
