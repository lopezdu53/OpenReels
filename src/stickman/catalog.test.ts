import { describe, expect, it } from "vitest";
import {
  beatCountForDuration,
  clampStickmanVoiceSpeed,
  formatStickmanDuration,
  frameSize,
  isLookId,
  planMotionTakes,
  recommendArc,
  recommendStickmanGflow,
  STICKMAN_ARCS,
  STICKMAN_DURATIONS,
  STICKMAN_STYLE_LOCK,
  stickmanArcHint,
  stickmanSpokenWindow,
} from "./catalog.js";

describe("stickman catalog", () => {
  it("recommends debate when the topic is a versus", () => {
    expect(recommendArc("Bitcoin vs el negocio tradicional")).toBe("vs_debate");
  });

  it("sizes beat counts for 10s through 8 min", () => {
    expect(beatCountForDuration(10)).toBe(3);
    expect(beatCountForDuration(20)).toBe(4);
    expect(beatCountForDuration(30)).toBe(6);
    expect(beatCountForDuration(60)).toBe(8);
    expect(beatCountForDuration(120)).toBe(12);
    expect(beatCountForDuration(300)).toBe(18);
    expect(beatCountForDuration(480)).toBe(24);
    expect(STICKMAN_DURATIONS).toEqual([10, 20, 30, 60, 120, 300, 480]);
    expect(formatStickmanDuration(120)).toBe("2 min");
    expect(formatStickmanDuration(20)).toBe("20s");
  });

  it("clamps narration speed and keeps a 0.3s/0.5s spoken window", () => {
    expect(clampStickmanVoiceSpeed(1)).toBe(1);
    expect(clampStickmanVoiceSpeed(9)).toBe(1.5);
    expect(clampStickmanVoiceSpeed(0.2)).toBe(0.7);
    expect(stickmanSpokenWindow(20)).toBeCloseTo(19.2, 5);
    expect(stickmanSpokenWindow(10)).toBeCloseTo(9.2, 5);
  });

  it("chains Omni in 10s takes (20s = 10+10, never a 6s leftover)", () => {
    expect(planMotionTakes([4, 6, 8, 10], 20)).toEqual([10, 10]);
    expect(planMotionTakes([4, 6, 8, 10], 10)).toEqual([10]);
    expect(planMotionTakes([4, 6, 8, 10], 30)).toEqual([10, 10, 10]);
    expect(planMotionTakes([4, 6, 8], 20)).toEqual([8, 8, 4]);
    expect(planMotionTakes([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 15)).toEqual([15]);
    expect(planMotionTakes([4, 6, 8, 10], 480)).toHaveLength(48);
    expect(recommendStickmanGflow(20)).toEqual({
      imageModel: "nano-pro",
      videoModel: "omni-flash",
      clipSeconds: 10,
      takes: [10, 10],
    });
    expect(recommendStickmanGflow(8).takes).toEqual([8]);
  });

  it("knows stickman looks and never mentions collage or film hero", () => {
    expect(isLookId("classic")).toBe(true);
    expect(isLookId("american-retro")).toBe(false);
    expect(STICKMAN_STYLE_LOCK).toContain("STICKMAN");
    expect(STICKMAN_STYLE_LOCK.toLowerCase()).toContain("no paper collage");
    expect(STICKMAN_STYLE_LOCK.toLowerCase()).toContain("no sphere-head");
  });

  it("describes each narrative arc", () => {
    expect(STICKMAN_ARCS.every((arc) => arc.hint.length > 20)).toBe(true);
    expect(stickmanArcHint("vs_debate")).toContain("Dos palitos");
    expect(stickmanArcHint("joke_punchline")).toContain("chiste");
  });

  it("maps aspects to render sizes", () => {
    expect(frameSize("9:16")).toEqual({ w: 1080, h: 1920 });
    expect(frameSize("16:9")).toEqual({ w: 1920, h: 1080 });
    expect(frameSize("1:1")).toEqual({ w: 1080, h: 1080 });
  });
});
