import { describe, expect, it } from "vitest";
import { draftScriptTemplate, lockStickmanVoice } from "./draft.js";
import type { StickmanJobConfig } from "./types.js";

const base: StickmanJobConfig = {
  topic: "por qué el café miente",
  durationSec: 10,
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
    const doc = draftScriptTemplate(base, "cafe-10s");
    expect(doc.style).toBe("stickman");
    expect(doc.provider).toBe("atlas_cloud");
    expect(doc.beats).toHaveLength(3);
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

  it("only enables captions when asked and writes a 10s GANCHO beat on long hook jobs", () => {
    expect(draftScriptTemplate({ ...base, captions: false }, "cafe-10s").captions).toBe(false);
    const hooked = draftScriptTemplate(
      { ...base, durationSec: 300, contentHook: true, captions: true },
      "cafe-5m",
    );
    expect(hooked.beats[0]?.title).toBe("GANCHO");
    expect(hooked.beats[0]?.durationSec).toBe(10);
    expect(hooked.contentHook).toBe(true);
    expect(hooked.captions).toBe(true);
  });

  it("keeps the Atlas voice the user picked even if the director changes voice_id", () => {
    const locked = lockStickmanVoice(
      { voice_id: "eve", language: "es", speed: 1 },
      { voice_id: "Palo", language: "en", speed: 1.4 },
      { ...base, voiceId: "Kore", language: "es", voiceSpeed: 1.1 },
    );
    expect(locked.voice_id).toBe("Kore");
    expect(locked.language).toBe("es");
    expect(locked.speed).toBe(1.1);
  });
});
