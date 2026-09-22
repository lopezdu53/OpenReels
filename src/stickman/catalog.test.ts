import { describe, expect, it } from "vitest";
import {
  beatCountForDuration,
  clampStickmanVoiceSpeed,
  clampStickmanVolume,
  formatStickmanDuration,
  frameSize,
  isLookId,
  isStickmanDuration,
  isVeoGflowJob,
  planMotionTakes,
  publishPlatformsForAspect,
  recommendArc,
  recommendStickmanGflow,
  resolveStickmanTtsModel,
  snapStickmanDuration,
  STICKMAN_ARCS,
  STICKMAN_DURATIONS,
  STICKMAN_OMNI_DURATIONS,
  STICKMAN_STYLE_LOCK,
  STICKMAN_VEO_DURATIONS,
  STICKMAN_VOICES,
  stickmanArcHint,
  stickmanDurationHint,
  stickmanDurationsForVideo,
  stickmanHookAvailable,
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
    expect(beatCountForDuration(900)).toBe(36);
    expect(beatCountForDuration(960)).toBe(36);
    expect(beatCountForDuration(1560)).toBe(48);
    expect(STICKMAN_DURATIONS).toEqual([10, 20, 30, 60, 120, 300, 480, 900]);
    expect(STICKMAN_OMNI_DURATIONS).toEqual([10, 20, 30, 60, 120, 300, 480, 900]);
    expect(STICKMAN_VEO_DURATIONS).toEqual([8, 16, 24, 960, 1560]);
    expect(formatStickmanDuration(120)).toBe("2 min");
    expect(formatStickmanDuration(900)).toBe("15 min");
    expect(formatStickmanDuration(960)).toBe("16 min");
    expect(formatStickmanDuration(1560)).toBe("26 min");
    expect(formatStickmanDuration(20)).toBe("20s");
    expect(formatStickmanDuration(8)).toBe("8s");
  });

  it("swaps Omni vs Veo 3.1 job durations", () => {
    expect(isVeoGflowJob("gflow", "veo-lite")).toBe(true);
    expect(isVeoGflowJob("gflow", "veo-quality")).toBe(true);
    expect(isVeoGflowJob("gflow", "omni-flash")).toBe(false);
    expect(isVeoGflowJob("atlas", "veo-lite")).toBe(false);
    expect(stickmanDurationsForVideo("gflow", "veo-lite")).toEqual([8, 16, 24, 960, 1560]);
    expect(stickmanDurationsForVideo("gflow", "omni-flash")).toEqual(STICKMAN_OMNI_DURATIONS);
    expect(isStickmanDuration(8, "gflow", "veo-lite")).toBe(true);
    expect(isStickmanDuration(10, "gflow", "veo-lite")).toBe(false);
    expect(isStickmanDuration(10, "gflow", "omni-flash")).toBe(true);
    expect(isStickmanDuration(8, "gflow", "omni-flash")).toBe(false);
    expect(stickmanDurationHint("gflow", "veo-lite")).toContain("26 min");
    expect(snapStickmanDuration(20, STICKMAN_VEO_DURATIONS)).toBe(16);
    expect(snapStickmanDuration(900, STICKMAN_VEO_DURATIONS)).toBe(960);
    expect(snapStickmanDuration(16, STICKMAN_OMNI_DURATIONS)).toBe(20);
    expect(snapStickmanDuration(1560, STICKMAN_OMNI_DURATIONS)).toBe(900);
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
    expect(STICKMAN_STYLE_LOCK.toLowerCase()).toContain("no blur");
    expect(STICKMAN_STYLE_LOCK.toLowerCase()).toContain("no shallow depth of field");
    expect(STICKMAN_STYLE_LOCK.toLowerCase()).toContain("no push-in");
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
    expect(stickmanHookAvailable(480)).toBe(true);
    expect(stickmanHookAvailable(900)).toBe(true);
    expect(stickmanHookAvailable(960, "gflow", "omni-flash")).toBe(false);
    expect(stickmanHookAvailable(960, "gflow", "veo-lite")).toBe(true);
    expect(stickmanHookAvailable(1560, "gflow", "veo-quality")).toBe(true);
    expect(stickmanHookAvailable(300, "gflow", "veo-lite")).toBe(false);
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
