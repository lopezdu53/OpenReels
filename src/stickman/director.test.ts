import { describe, expect, it } from "vitest";
import { stickmanDirectorPrompt } from "./director.js";
import type { StickmanJobConfig } from "./types.js";

const config: StickmanJobConfig = {
  topic: "un rumor no es un veredicto",
  durationSec: 10,
  aspect: "16:9",
  language: "es",
  look: "classic",
  castMode: "duo",
  arc: "warning",
  voiceId: "eve",
  voiceSpeed: 1,
  captions: true,
  animate: true,
  imageModel: "x",
  videoModel: "y",
  atlasTtsModel: "xai/tts-v1",
};

describe("stickman director prompt", () => {
  it("uses the original stickman-video-director contract, not OpenReels", () => {
    const prompt = stickmanDirectorPrompt(config, 3, "{}");
    expect(prompt).toContain("Educational");
    expect(prompt).toContain("NO jump cuts");
    expect(prompt.toLowerCase()).toContain("chain");
    expect(prompt).toContain("FITS");
    expect(prompt).toContain("0.3s");
    expect(prompt).toContain("0.5s");
    expect(prompt.toLowerCase()).not.toContain("director score");
    expect(prompt.toLowerCase()).not.toContain("archetype");
    expect(prompt).toContain("un rumor no es un veredicto");
  });

  it("asks for mute acting and a 10s hook when those flags are on", () => {
    const prompt = stickmanDirectorPrompt(
      { ...config, muteCharacter: true, contentHook: true, durationSec: 300 },
      18,
      "{}",
    );
    expect(prompt).toContain("MUTE CHARACTER");
    expect(prompt).toContain("CONTENT HOOK");
    expect(prompt).toContain("GANCHO");
  });
});
