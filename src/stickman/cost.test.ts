import { describe, expect, it } from "vitest";
import { estimateStickmanCost, llmUsageFromAtlas, llmUsd } from "./cost.js";
import type { StickmanJobConfig } from "./types.js";

const config: StickmanJobConfig = {
  topic: "wifi",
  durationSec: 20,
  aspect: "16:9",
  language: "es",
  look: "classic",
  castMode: "solo",
  arc: "joke_punchline",
  voiceId: "eve",
  voiceSpeed: 1,
  captions: false,
  animate: true,
  muteCharacter: true,
  imageModel: "google/nano-banana-2-lite/text-to-image",
  videoModel: "bytedance/seedance-2.0-mini/image-to-video",
  atlasTtsModel: "xai/tts-v1",
  visualProvider: "gflow",
  gflowVideoModel: "omni-flash",
  llmModel: "google/gemini-2.5-flash",
};

describe("stickman cost", () => {
  it("parses Atlas usage and prices Gemini 2.5 Flash tokens", () => {
    const usage = llmUsageFromAtlas({
      prompt_tokens: 1000,
      completion_tokens: 500,
      total_tokens: 1500,
    });
    expect(usage?.totalTokens).toBe(1500);
    expect(llmUsd("google/gemini-2.5-flash", usage)).toBeCloseTo(0.00155, 5);
  });

  it("skips TTS dollars when the character is mute and counts Omni credits", () => {
    const cost = estimateStickmanCost({
      config,
      script: {
        project: "x",
        topic: "wifi",
        language: "es",
        aspect: "16:9",
        style: "stickman",
        provider: "atlas_cloud",
        look: "classic",
        castMode: "solo",
        arc: "joke_punchline",
        bible: { look: "classic", cast: [], world: "" },
        voice: { voice_id: "eve", language: "es", speed: 1 },
        captions: false,
        animate: true,
        image_model: "x",
        video_model: "y",
        beats: [
          {
            id: 1,
            title: "A",
            pose: "p",
            scene: "s",
            narration: "hola ".repeat(40),
            durationSec: 10,
          },
        ],
      },
    });
    expect(cost.credits).toBeGreaterThan(0);
    expect(cost.usd).toBe(0);
  });
});
