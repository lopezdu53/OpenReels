import { describe, expect, it } from "vitest";
import { buildRunPodVideoJobInput, RunPodVideo } from "./runpod.js";

describe("RunPodVideo", () => {
  it("constructs a public endpoint from API key only", () => {
    const video = new RunPodVideo({ apiKey: "rp-key" });
    expect(video).toBeInstanceOf(RunPodVideo);
    expect(video.supportedDurations).toEqual([5, 8, 10]);
  });
});

describe("buildRunPodVideoJobInput", () => {
  it("nests p-video fields under input for WaveSpeed", () => {
    const payload = buildRunPodVideoJobInput({
      modelId: "p-video",
      prompt: "camera slowly orbits the colosseum",
      imageDataUri: "data:image/png;base64,abc",
      duration: 5,
      aspectRatio: "9:16",
      resolution: "720p",
      negativePrompt: "blur",
    });

    expect(payload).toEqual({
      input: {
        prompt: "camera slowly orbits the colosseum",
        image: "data:image/png;base64,abc",
        duration: 5,
        aspect_ratio: "9:16",
        resolution: "720p",
      },
    });
    expect(payload).not.toHaveProperty("negative_prompt");
    expect(payload).not.toHaveProperty("seed");
  });

  it("keeps Wan payloads flat with size + negative prompt", () => {
    const payload = buildRunPodVideoJobInput({
      modelId: "wan-2-6-i2v",
      prompt: "pan left",
      imageDataUri: "data:image/png;base64,abc",
      duration: 5,
      aspectRatio: "9:16",
      resolution: "720p",
      negativePrompt: "jitter",
    });

    expect(payload["input"]).toBeUndefined();
    expect(payload["prompt"]).toBe("pan left");
    expect(payload["size"]).toBe("720*1280");
    expect(payload["negative_prompt"]).toBe("jitter");
    expect(payload["shot_type"]).toBe("single");
  });
});
