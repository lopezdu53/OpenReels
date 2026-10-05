import { describe, expect, it } from "vitest";
import { draftBeatsTemplate } from "./draft.js";
import type { VoxJobConfig } from "./types.js";

const base: VoxJobConfig = {
  mode: "broll",
  topic: "una breve historia del café",
  durationSec: 15,
  aspect: "16:9",
  language: "es",
  arc: "timeline",
  voiceId: "leo",
  voiceSpeed: 1,
  themes: ["american-retro"],
  videoModel: "google/gemini-omni-flash/image-to-video",
  imageModel: "google/nano-banana-2/text-to-image",
  motionStyle: "punchy",
  constraints: "strict",
  music: "instrumental",
  captions: true,
  captionStyle: "white",
  watermark: "Made with Atlas Cloud · vox-director",
  realPeople: false,
};

describe("vox draftBeatsTemplate", () => {
  it("writes a collage beats.json without OpenReels fields", () => {
    const doc = draftBeatsTemplate(base, "cafe-15s");
    expect(doc.style).toBe("collage");
    expect(doc.provider).toBe("atlas_cloud");
    expect(doc.beats).toHaveLength(3);
    expect(doc.beats[0]!.shots).toHaveLength(1);
    expect(JSON.stringify(doc)).not.toContain("directorScore");
    expect(JSON.stringify(doc)).not.toContain("archetype");
    expect(doc.aspect_approx_confirmed).toBe(true);
  });

  it("uses Kling when the film has real people", () => {
    const doc = draftBeatsTemplate({ ...base, realPeople: true }, "celeb-15s");
    expect(doc.video_model).toContain("kling");
  });
});
