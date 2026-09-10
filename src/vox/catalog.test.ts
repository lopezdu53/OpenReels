import { describe, expect, it } from "vitest";
import { beatCountForDuration, isThemeId, recommendArc } from "./catalog.js";

describe("vox catalog", () => {
  it("recommends timeline for history topics", () => {
    expect(recommendArc("evolución del café en la historia")).toBe("timeline");
  });

  it("sizes 15/30/60s beat maps", () => {
    expect(beatCountForDuration(15)).toEqual({ beats: 3, shotsPerBeat: 1 });
    expect(beatCountForDuration(30)).toEqual({ beats: 6, shotsPerBeat: 2 });
    expect(beatCountForDuration(60)).toEqual({ beats: 10, shotsPerBeat: 2 });
  });

  it("knows theme ids from the skill presets", () => {
    expect(isThemeId("american-retro")).toBe(true);
    expect(isThemeId("openreels-cinematic")).toBe(false);
  });
});
