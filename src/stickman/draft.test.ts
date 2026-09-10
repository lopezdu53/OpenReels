import { describe, expect, it } from "vitest";
import { draftScriptTemplate } from "./draft.js";
import type { StickmanJobConfig } from "./types.js";

const base: StickmanJobConfig = {
  topic: "por qué el café miente",
  durationSec: 15,
  aspect: "9:16",
  language: "es",
  look: "classic",
  castMode: "solo",
  arc: "joke_punchline",
  voiceId: "eve",
  voiceSpeed: 1,
  captions: true,
  animate: false,
  imageModel: "google/nano-banana-2-lite/text-to-image",
  videoModel: "bytedance/seedance-2.0-mini/image-to-video",
  atlasTtsModel: "xai/tts-v1",
};

describe("stickman draftScriptTemplate", () => {
  it("writes a stickman script without Film hero or Vox collage fields", () => {
    const doc = draftScriptTemplate(base, "cafe-15s");
    expect(doc.style).toBe("stickman");
    expect(doc.provider).toBe("atlas_cloud");
    expect(doc.beats).toHaveLength(4);
    expect(doc.bible.cast[0]?.name).toBe("Palo");
    const raw = JSON.stringify(doc);
    expect(raw).not.toContain("directorScore");
    expect(raw).not.toContain("archetype");
    expect(raw).not.toContain("collage");
    expect(raw).not.toContain("sphere-head");
  });

  it("locks a second stick figure for duo", () => {
    const doc = draftScriptTemplate({ ...base, castMode: "duo" }, "debate-15s");
    expect(doc.bible.cast).toHaveLength(2);
    expect(doc.bible.cast[1]?.name).toBe("Línea");
  });
});
