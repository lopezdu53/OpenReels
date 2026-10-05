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
  it("sends a hosted HTTPS still to p-video and omits aspect_ratio", () => {
    const payload = buildRunPodVideoJobInput({
      modelId: "p-video",
      prompt: "camera slowly orbits the colosseum",
      image: "https://image.runpod.ai/p-image-t2i/scene.png",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      negativePrompt: "blur",
    });

    expect(payload).toEqual({
      prompt: "camera slowly orbits the colosseum",
      image: "https://image.runpod.ai/p-image-t2i/scene.png",
      duration: 5,
      resolution: "720p",
    });
    expect(payload["input"]).toBeUndefined();
    expect(payload).not.toHaveProperty("aspect_ratio");
    expect(payload).not.toHaveProperty("negative_prompt");
    expect(payload).not.toHaveProperty("seed");
  });

  it("drops data-URI stills on p-video so WaveSpeed does not 400", () => {
    const payload = buildRunPodVideoJobInput({
      modelId: "p-video",
      prompt: "coati walks to the river",
      image: "data:image/png;base64,abc",
      duration: 5,
      aspectRatio: "16:9",
      resolution: "720p",
    });

    expect(payload).toEqual({
      prompt: "coati walks to the river",
      duration: 5,
      aspect_ratio: "16:9",
      resolution: "720p",
    });
    expect(payload["image"]).toBeUndefined();
  });

  it("keeps Wan payloads flat with size + negative prompt", () => {
    const payload = buildRunPodVideoJobInput({
      modelId: "wan-2-6-i2v",
      prompt: "pan left",
      image: "data:image/png;base64,abc",
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
