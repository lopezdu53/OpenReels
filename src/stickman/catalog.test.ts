import { describe, expect, it } from "vitest";
import {
  beatCountForDuration,
  beatCountForJob,
  clampStickmanVoiceSpeed,
  clampStickmanVolume,
  formatStickmanDuration,
  frameSize,
  isLookId,
  planMotionTakes,
  publishPlatformsForAspect,
  recommendArc,
  recommendStickmanGflow,
  resolveStickmanTtsModel,
  STICKMAN_ARCS,
  STICKMAN_DURATIONS,
  STICKMAN_STYLE_LOCK,
  STICKMAN_VOICES,
  stickmanArcHint,
  stickmanHookAvailable,
  stickmanSpokenWindow,
} from "./catalog.js";

describe("stickman catalog", () => {
  it("recommends debate when the topic is a versus", () => {
    expect(recommendArc("Bitcoin vs el negocio tradicional")).toBe("vs_debate");
  });

  it("sizes beat counts for 10s through 30 min", () => {
    expect(beatCountForDuration(10)).toBe(3);
    expect(beatCountForDuration(30)).toBe(6);
    expect(beatCountForDuration(60)).toBe(8);
    expect(beatCountForDuration(120)).toBe(12);
    expect(beatCountForDuration(300)).toBe(18);
    expect(beatCountForDuration(900)).toBe(36);
    expect(beatCountForDuration(1800)).toBe(54);
    expect(STICKMAN_DURATIONS).toEqual([10, 30, 60, 120, 180, 300, 600, 900, 1200, 1800]);
    expect(formatStickmanDuration(120)).toBe("2 min");
    expect(formatStickmanDuration(1800)).toBe("30 min");
    expect(formatStickmanDuration(10)).toBe("10s");
    expect(beatCountForJob({ durationSec: 60, animate: false, stillIntervalSec: 10 })).toBe(6);
    expect(beatCountForJob({ durationSec: 60, animate: false, stillIntervalSec: 5 })).toBe(12);
  });

  it("clamps narration speed and keeps a 0.3s/0.5s spoken window", () => {
    expect(clampStickmanVoiceSpeed(1)).toBe(1);
    expect(clampStickmanVoiceSpeed(9)).toBe(1.5);
    expect(clampStickmanVoiceSpeed(0.2)).toBe(0.7);
    expect(stickmanSpokenWindow(16)).toBeCloseTo(15.2, 5);
    expect(stickmanSpokenWindow(8)).toBeCloseTo(7.2, 5);
  });

  it("chains Omni in 8s takes (30s = 4×8, last trimmed when assembling)", () => {
    expect(planMotionTakes([4, 6, 8], 20)).toEqual([8, 8, 4]);
    expect(planMotionTakes([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 15)).toEqual([15]);
    expect(recommendStickmanGflow(30)).toEqual({
      imageModel: "nano-pro",
      videoModel: "omni-flash",
      clipSeconds: 8,
      takes: [8, 8, 8, 8],
    });
    expect(recommendStickmanGflow(16).takes).toEqual([8, 8]);
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

  it("gates the 10s hook and publish networks by aspect", () => {
    expect(stickmanHookAvailable(10)).toBe(false);
    expect(stickmanHookAvailable(300)).toBe(true);
    expect(stickmanHookAvailable(600)).toBe(true);
    expect(stickmanHookAvailable(900)).toBe(true);
    expect(publishPlatformsForAspect("16:9")).toEqual(["youtube", "facebook"]);
    expect(publishPlatformsForAspect("9:16")).toEqual([
      "youtube",
      "facebook",
      "instagram",
      "tiktok",
    ]);
    expect(publishPlatformsForAspect("1:1")).toEqual(["instagram"]);
  });

  it("ships more than the five xAI voices and maps Gemini voices to Flash TTS", () => {
    expect(STICKMAN_VOICES.length).toBeGreaterThan(10);
    expect(resolveStickmanTtsModel("Kore")).toBe("google/gemini-2.5-flash-tts");
    expect(resolveStickmanTtsModel("Leda")).toBe("google/gemini-2.5-flash-tts");
    expect(resolveStickmanTtsModel("English_expressive_narrator")).toBe("minimax/speech-2.6-turbo");
    expect(resolveStickmanTtsModel("eve")).toBe("xai/tts-v1");
    expect(clampStickmanVolume(2, 0.5)).toBe(1);
    expect(clampStickmanVolume(-1, 0.5)).toBe(0);
    expect(clampStickmanVolume(undefined, 0.5)).toBe(0.5);
  });
});
