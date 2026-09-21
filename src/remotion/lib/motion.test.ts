import { describe, expect, it } from "vitest";
import {
  kenBurnsTransform,
  MATCH_CUT_BLEND_FRAMES,
  MATCH_CUT_SKIP_FRAMES,
  resolveVideoPlayback,
} from "./motion.js";

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

  it("stretches a match-cut clip after skipping the incoming still-echo", () => {
    const play = resolveVideoPlayback({
      sourceDurationSeconds: 5,
      sceneDurationSeconds: 5.5,
      visualType: "ai_video",
      startFromFrames: MATCH_CUT_SKIP_FRAMES,
      fps: 30,
      fillScene: true,
    });
    expect(play.loop).toBe(false);
    expect(play.playbackRate).toBeCloseTo((5 - MATCH_CUT_SKIP_FRAMES / 30) / 5.5, 3);
    expect(play.playbackRate).toBeGreaterThanOrEqual(0.7);
    expect(MATCH_CUT_BLEND_FRAMES).toBe(3);
  });
});
