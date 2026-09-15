import { describe, expect, it } from "vitest";
import {
  beatCountForDuration,
  frameSize,
  isLookId,
  recommendArc,
  recommendStickmanGflow,
  STICKMAN_ARCS,
  STICKMAN_STYLE_LOCK,
  stickmanArcHint,
} from "./catalog.js";

describe("stickman catalog", () => {
  it("recommends debate when the topic is a versus", () => {
    expect(recommendArc("Bitcoin vs el negocio tradicional")).toBe("vs_debate");
  });

  it("sizes beat counts for 10/15/30/60/90s", () => {
    expect(beatCountForDuration(10)).toBe(3);
    expect(beatCountForDuration(15)).toBe(3);
    expect(beatCountForDuration(30)).toBe(6);
    expect(beatCountForDuration(60)).toBe(8);
    expect(beatCountForDuration(90)).toBe(10);
  });

  it("picks Banana Pro + Omni 10s for a no-cut gflow take", () => {
    expect(recommendStickmanGflow(15)).toEqual({
      imageModel: "nano-pro",
      videoModel: "omni-flash",
      clipSeconds: 10,
    });
    expect(recommendStickmanGflow(8).clipSeconds).toBe(8);
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
