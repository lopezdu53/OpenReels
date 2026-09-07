import { describe, expect, it } from "vitest";
import { draftScriptTemplate } from "./draft.js";
import { buildStillPrompt, castLock } from "./visuals.js";
import type { StickmanJobConfig } from "./types.js";

const config: StickmanJobConfig = {
  topic: "el wifi de la oficina",
  durationSec: 15,
  aspect: "9:16",
  language: "es",
  look: "chalk",
  castMode: "duo",
  arc: "vs_debate",
  voiceId: "eve",
  voiceSpeed: 1,
  captions: true,
  animate: false,
  imageModel: "x",
  videoModel: "y",
  atlasTtsModel: "xai/tts-v1",
};

describe("stickman visuals", () => {
  it("locks both stick figures and forbids collage/hero language in the still prompt", () => {
    const script = draftScriptTemplate(config, "wifi-15s");
    const prompt = buildStillPrompt(script, script.beats[0]!);
    expect(castLock(script)).toContain("Palo");
    expect(castLock(script)).toContain("Línea");
    expect(prompt).toContain("STICKMAN");
    expect(prompt.toLowerCase()).toContain("no paper collage");
    expect(prompt.toLowerCase()).toContain("no sphere-head");
    expect(prompt).toContain("chalk");
  });
});
