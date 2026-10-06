import type { Queue } from "bullmq";
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

export async function cancelStickmanWork(
  id: string,
  queue?: Queue<{ id: string; action?: string }>,
): Promise<void> {
  setStatus(id, "cancelled", "cancelled", "Cancelado");
  if (!queue) return;
  const jobs = await queue.getJobs(["wait", "waiting", "delayed", "paused", "active"]);
  for (const job of jobs) {
    if (job.data?.id !== id) continue;
    try {
      await job.remove();
    } catch {
      /* active lock — worker stops via assertStickmanActive */
    }
  }
}
