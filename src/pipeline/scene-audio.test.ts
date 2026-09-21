import { describe, expect, it } from "vitest";
import { sliceSceneAudio } from "./scene-audio.js";

describe("sliceSceneAudio", () => {
  it("returns undefined without words or path", () => {
    expect(sliceSceneAudio("", [{ word: "hi", start: 0, end: 0.2 }])).toBeUndefined();
    expect(sliceSceneAudio("/tmp/missing.mp3", [])).toBeUndefined();
  });
});
