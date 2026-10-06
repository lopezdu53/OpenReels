export type StickmanQueueKind = "stickman" | "historia";

export type StickmanQueueRow = {
  id: string;
  topic: string;
  kind: StickmanQueueKind;
  status: string;
  stage: string;
  detail: string;
};

export type StickmanQueueSnapshot = {
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  workerLive: boolean;
  producing: StickmanQueueRow[];
  queued: StickmanQueueRow[];
  position?: number;
};

export function studioKindLabel(kind: string): string {
  return kind === "historia" ? "Historia" : "Stickman";
}

export function rowFromJobMeta(
  id: string,
  meta: {
    topic?: string;
    kind?: string;
    status?: string;
    stage?: string;
    detail?: string;
  } | null,
): StickmanQueueRow {
  return {
    id,
    topic: meta?.topic?.trim() || id,
    kind: meta?.kind === "historia" ? "historia" : "stickman",
    status: meta?.status ?? "producing",
    stage: meta?.stage ?? "produce",
    detail: meta?.detail ?? "",
  };
}

const DEAD_STATUSES = new Set(["cancelled", "completed", "failed"]);

export function isLiveQueueRow(row: StickmanQueueRow): boolean {
  return !DEAD_STATUSES.has(row.status);
}

export function buildStickmanQueueSnapshot(input: {
  waitingCount: number;
  activeCount: number;
  failed: number;
  delayed: number;
  workerLive: boolean;
  producingIds: string[];
  queuedIds: string[];
  metaOf: (id: string) => Parameters<typeof rowFromJobMeta>[1];
  forId?: string;
}): StickmanQueueSnapshot {
  const producing = input.producingIds
    .filter(Boolean)
    .map((id) => rowFromJobMeta(id, input.metaOf(id)))
    .filter(isLiveQueueRow);
  const queued = input.queuedIds
    .filter(Boolean)
    .map((id) => rowFromJobMeta(id, input.metaOf(id)))
    .filter(isLiveQueueRow);
  const pos = input.forId ? queued.findIndex((row) => row.id === input.forId) : -1;
  return {
    waiting: queued.length,
    active: producing.length,
    failed: input.failed,
    delayed: input.delayed,
    workerLive: input.workerLive,
    producing,
    queued,
    position: pos >= 0 ? pos + 1 : undefined,
  };
}
