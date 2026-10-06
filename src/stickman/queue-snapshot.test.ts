import { describe, expect, it } from "vitest";
import {
  buildStickmanQueueSnapshot,
  rowFromJobMeta,
  studioKindLabel,
} from "./queue-snapshot.js";

describe("stickman queue snapshot", () => {
  it("labels historia vs stickman", () => {
    expect(studioKindLabel("historia")).toBe("Historia");
    expect(studioKindLabel("stickman")).toBe("Stickman");
  });

  it("falls back to the job id when topic is missing", () => {
    expect(rowFromJobMeta("stickman-abc", null)).toMatchObject({
      id: "stickman-abc",
      topic: "stickman-abc",
      kind: "stickman",
    });
  });

  it("lists the active Historia and waiting Stickman with position", () => {
    const snap = buildStickmanQueueSnapshot({
      waitingCount: 1,
      activeCount: 1,
      failed: 0,
      delayed: 0,
      workerLive: true,
      producingIds: ["stickman-hist"],
      queuedIds: ["stickman-wait"],
      forId: "stickman-wait",
      metaOf: (id) =>
        id === "stickman-hist"
          ? {
              topic: "tito de vacaciones en dubai",
              kind: "historia",
              status: "producing",
              stage: "visuals",
              detail: "Generando stills del Casting",
            }
          : {
              topic: "como hacer dinero sin saber nada",
              kind: "stickman",
              status: "producing",
              stage: "produce",
              detail: "En cola: palitos",
            },
    });
    expect(snap.producing[0]?.topic).toBe("tito de vacaciones en dubai");
    expect(snap.producing[0]?.kind).toBe("historia");
    expect(snap.queued[0]?.topic).toBe("como hacer dinero sin saber nada");
    expect(snap.position).toBe(1);
    expect(snap.workerLive).toBe(true);
  });

  it("omits position when the job is the one producing", () => {
    const snap = buildStickmanQueueSnapshot({
      waitingCount: 0,
      activeCount: 1,
      failed: 0,
      delayed: 0,
      workerLive: true,
      producingIds: ["stickman-hist"],
      queuedIds: [],
      forId: "stickman-hist",
      metaOf: () => ({ topic: "tito", kind: "historia" }),
    });
    expect(snap.position).toBeUndefined();
    expect(snap.producing).toHaveLength(1);
  });
});
