import type { Job, Queue } from "bullmq";
import { interruptTobyForJob } from "../providers/toby/generate.js";
import { readMeta, setStatus } from "./store.js";

export class StickmanCancelledError extends Error {
  constructor() {
    super("El trabajo fue cancelado");
    this.name = "StickmanCancelledError";
  }
}

export function assertStickmanActive(id: string): void {
  const meta = readMeta(id);
  if (!meta || meta.status === "cancelled") throw new StickmanCancelledError();
}

export function isStickmanCancelledError(err: unknown): boolean {
  return err instanceof StickmanCancelledError || /fue cancelado/i.test(String(err));
}

async function dropQueueJob<T>(job: Job<T>): Promise<void> {
  try {
    await job.moveToFailed(new Error("Cancelled by user"), "0", true);
  } catch {
    /* waiting / no token */
  }
  try {
    await job.remove();
  } catch {
    /* active lock — worker stops via assertStickmanActive + Toby interrupt */
  }
}

export async function dropDeadStickmanQueueJobs<T extends { id: string }>(
  queue: Queue<T>,
): Promise<void> {
  const jobs = await queue.getJobs(["wait", "waiting", "delayed", "paused", "active"]);
  for (const job of jobs) {
    const id = job.data?.id;
    if (!id) continue;
    const meta = readMeta(id);
    if (!meta || (meta.status !== "cancelled" && meta.status !== "failed")) continue;
    await dropQueueJob(job);
  }
}

export async function cancelStickmanWork<T extends { id: string }>(
  id: string,
  queue?: Queue<T>,
): Promise<void> {
  setStatus(id, "cancelled", "cancelled", "Cancelado");
  await interruptTobyForJob(id);
  if (!queue) return;
  const jobs = await queue.getJobs(["wait", "waiting", "delayed", "paused", "active"]);
  for (const job of jobs) {
    if (job.data?.id !== id) continue;
    await dropQueueJob(job);
  }
}
