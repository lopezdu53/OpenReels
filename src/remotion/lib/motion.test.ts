import { describe, expect, it } from "vitest";
import { kenBurnsTransform, resolveVideoPlayback } from "./motion.js";

describe("kenBurnsTransform", () => {
  it("keeps zooming instead of sitting static at the end", () => {
    const start = kenBurnsTransform({ progress: 0, motion: "zoom_in" });
    const end = kenBurnsTransform({ progress: 1, motion: "zoom_in" });
    expect(end.scale).toBeGreaterThan(start.scale);
  });
});

describe("resolveVideoPlayback", () => {
  it("slows a short AI clip but never loops — last frame is the match-cut seed", () => {
    const play = resolveVideoPlayback({
      sourceDurationSeconds: 8,
      sceneDurationSeconds: 16,
      visualType: "ai_video",
    });
    expect(play.loop).toBe(false);
    expect(play.playbackRate).toBeLessThan(1);
    expect(play.playbackRate).toBeGreaterThanOrEqual(0.82);
  });

  it("does not loop when the clip already covers the scene", () => {
    const play = resolveVideoPlayback({
      sourceDurationSeconds: 8,
      sceneDurationSeconds: 7,
      visualType: "ai_video",
    });
    expect(play.loop).toBe(false);
    expect(play.playbackRate).toBe(1);
  });
});
