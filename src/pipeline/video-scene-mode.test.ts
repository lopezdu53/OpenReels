import { describe, expect, it } from "vitest";
import {
  applyVideoSceneMode,
  countVideoSceneTargets,
  normalizeVideoSceneMode,
  videoSceneModeGuidance,
} from "./video-scene-mode.js";

function types(scenes: Array<{ visual_type: string }>): string[] {
  return scenes.map((s) => s.visual_type);
}

describe("normalizeVideoSceneMode", () => {
  it("maps the old force_/filter aliases onto one pattern", () => {
    expect(normalizeVideoSceneMode("force_first")).toBe("first");
    expect(normalizeVideoSceneMode("force_first3")).toBe("first3");
    expect(normalizeVideoSceneMode("first_every2")).toBe("every2");
    expect(normalizeVideoSceneMode("force_first_every2")).toBe("every2");
    expect(normalizeVideoSceneMode("all")).toBe("all");
    expect(normalizeVideoSceneMode("auto")).toBe("auto");
    expect(normalizeVideoSceneMode(undefined)).toBe("all");
  });
});

describe("applyVideoSceneMode", () => {
  const mix = [
    { visual_type: "ai_image" },
    { visual_type: "ai_image" },
    { visual_type: "text_card" },
    { visual_type: "ai_video" },
    { visual_type: "ai_image" },
    { visual_type: "stock_image" },
    { visual_type: "ai_image" },
  ];

  it("leaves the director mix when mode is all/auto/omitted", () => {
    expect(types(applyVideoSceneMode(mix, "all"))).toEqual(types(mix));
    expect(types(applyVideoSceneMode(mix, "auto"))).toEqual(types(mix));
    expect(types(applyVideoSceneMode(mix))).toEqual(types(mix));
  });

  it("promotes the first AI still when the director marked video later", () => {
    const next = applyVideoSceneMode(mix, "first");
    expect(types(next)).toEqual([
      "ai_video",
      "ai_image",
      "text_card",
      "ai_image",
      "ai_image",
      "stock_image",
      "ai_image",
    ]);
    expect(next[0]!.motion).toBe("static");
  });

  it("makes the first three convertible scenes video (skips text_card/stock)", () => {
    expect(types(applyVideoSceneMode(mix, "first3"))).toEqual([
      "ai_video",
      "ai_video",
      "text_card",
      "ai_video",
      "ai_image",
      "stock_image",
      "ai_image",
    ]);
    expect(types(applyVideoSceneMode(mix, "force_first3"))).toEqual(
      types(applyVideoSceneMode(mix, "first3")),
    );
  });

  it("alternates video / still among AI scenes (1st, 3rd, 5th…)", () => {
    // convertibles: 0,1,3,4,6 → video, image, video, image, video
    expect(types(applyVideoSceneMode(mix, "every2"))).toEqual([
      "ai_video",
      "ai_image",
      "text_card",
      "ai_video",
      "ai_image",
      "stock_image",
      "ai_video",
    ]);
    expect(types(applyVideoSceneMode(mix, "first_every2"))).toEqual(
      types(applyVideoSceneMode(mix, "every2")),
    );
  });

  it("alternates starting with a still (2nd, 4th, 6th…)", () => {
    expect(types(applyVideoSceneMode(mix, "every2_offset"))).toEqual([
      "ai_image",
      "ai_video",
      "text_card",
      "ai_image",
      "ai_video",
      "stock_image",
      "ai_image",
    ]);
  });

  it("turns every AI still into video without touching cards or stock", () => {
    expect(types(applyVideoSceneMode(mix, "force_all"))).toEqual([
      "ai_video",
      "ai_video",
      "text_card",
      "ai_video",
      "ai_video",
      "stock_image",
      "ai_video",
    ]);
  });
});

describe("countVideoSceneTargets", () => {
  it("matches the assigner quotas", () => {
    expect(countVideoSceneTargets(10, "first")).toBe(1);
    expect(countVideoSceneTargets(10, "first3")).toBe(3);
    expect(countVideoSceneTargets(10, "every2")).toBe(5);
    expect(countVideoSceneTargets(10, "every2_offset")).toBe(5);
    expect(countVideoSceneTargets(9, "every2_offset")).toBe(4);
    expect(countVideoSceneTargets(8, "force_all")).toBe(8);
  });
});

describe("videoSceneModeGuidance", () => {
  it("is empty when video is off", () => {
    expect(videoSceneModeGuidance("every2", false)).toBe("");
  });

  it("describes the alternate pattern", () => {
    expect(videoSceneModeGuidance("every2", true)).toMatch(/1st, 3rd, 5th/);
    expect(videoSceneModeGuidance("force_all", true)).toMatch(/EVERY/);
  });
});
