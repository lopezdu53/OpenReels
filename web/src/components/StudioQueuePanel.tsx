import { useEffect, useState } from "react";
import { api, type StickmanQueueRow, type StickmanQueueSnapshot } from "@/hooks/useApi";

export function useStudioQueue(pollMs = 4000): StickmanQueueSnapshot | undefined {
  const [queue, setQueue] = useState<StickmanQueueSnapshot | undefined>();
  useEffect(() => {
    let live = true;
    const load = () => {
      api
        .getStickmanQueue()
        .then((next) => {
          if (live) setQueue(next);
        })
        .catch(() => {});
    };
    load();
    const timer = setInterval(load, pollMs);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pollMs]);
  return queue;
}

export function queueChipForJob(queue: StickmanQueueSnapshot | undefined, jobId: string): string | undefined {
  if (!queue) return undefined;
  if (queue.producing?.some((row) => row.id === jobId)) return "Produciendo";
  const index = queue.queued?.findIndex((row) => row.id === jobId) ?? -1;
  if (index >= 0) return `En cola ${index + 1}`;
  return undefined;
}

function kindLabel(kind: string): string {
  return kind === "historia" ? "Historia" : "Stickman";
}

function rowLine(row: StickmanQueueRow): string {
  const detail = row.detail?.trim();
  return detail ? `${row.topic} · ${detail}` : row.topic;
}

export function StudioQueuePanel({
  queue,
  jobId,
  compact,
}: {
  queue?: StickmanQueueSnapshot;
  jobId?: string;
  compact?: boolean;
}) {
  if (!queue) return null;
  const producing = queue.producing ?? [];
  const queued = queue.queued ?? [];
  const empty = producing.length === 0 && queued.length === 0 && queue.active === 0 && queue.waiting === 0;
  const mineProducing = Boolean(jobId && producing.some((row) => row.id === jobId));
  const mineQueued = Boolean(jobId && queued.some((row) => row.id === jobId));
  const ahead = producing[0];
  const stuckOnDisk =
    Boolean(queue.workerLive) &&
    mineProducing &&
    /en cola/i.test(producing.find((row) => row.id === jobId)?.detail ?? "");

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
        Cola del worker · {queue.workerLive ? "conectado" : "sin worker"}
      </p>
      {!queue.workerLive && (
        <p>
          El worker de Stickman/Historia no está conectado. Reimplementa video-worker en EasyPanel
          (misma rama y mismas variables que video).
        </p>
      )}
      {queue.workerLive && empty && <p className="text-muted-foreground">Nada en cola. El worker está libre.</p>}
      {producing.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">Produciendo ahora</p>
          <ul className="space-y-1 text-muted-foreground">
            {producing.map((row) => (
              <li key={row.id}>
                {kindLabel(row.kind)}: {rowLine(row)}
                {jobId === row.id ? " · este trabajo" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
      {queued.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium">
            En cola ({queue.waiting || queued.length}
            {queue.position ? ` · tu puesto ${queue.position}` : ""})
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
            {queued.map((row) => (
              <li key={row.id}>
                {kindLabel(row.kind)}: {rowLine(row)}
                {jobId === row.id ? " · este trabajo" : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
      {mineQueued && ahead && (
        <p>
          Este trabajo espera. El worker solo hace un video a la vez. Ahora produce «{ahead.topic}» (
          {kindLabel(ahead.kind)}).
        </p>
      )}
      {mineProducing && !compact && (
        <p className="text-muted-foreground">Este trabajo es el que está produciendo ahora.</p>
      )}
      {stuckOnDisk && (
        <p>
          El worker ya tomó este job pero no ve los archivos. En video-worker quita cualquier volumen
          extra montado en /app/jobs/stickman. Deja solo jobs_data → /app/jobs.
        </p>
      )}
    </div>
  );
}
