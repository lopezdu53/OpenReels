import { describe, expect, it } from "vitest";
import { getRunPodImageModel } from "../runpod/catalog.js";
import { buildRunPodImageJobInput, resolveRunPodImageJob, RunPodImage } from "./runpod.js";

describe("RunPodImage", () => {
  it("constructs a public endpoint from API key only", () => {
    const img = new RunPodImage({ apiKey: "rp-key" });
    expect(img).toBeInstanceOf(RunPodImage);
  });

  it("accepts a public model id without a custom endpoint UUID", () => {
    const img = new RunPodImage({
      model: "z-image-turbo",
      apiKey: "rp-key",
    });
    expect(img).toBeInstanceOf(RunPodImage);
  });

  it("sends landscape width/height and 16:9 for Film stills", () => {
    const spec = getRunPodImageModel("black-forest-labs-flux-1-schnell");
    const input = buildRunPodImageJobInput({
      spec,
      prompt: "a coati cub",
      width: 1344,
      height: 768,
      aspectRatio: "16:9",
      steps: 4,
      guidance: 1,
    });
    expect(input["width"]).toBe(1344);
    expect(input["height"]).toBe(768);
    expect(input["aspect_ratio"]).toBe("16:9");
    expect(input["size"]).toBe("1344*768");
  });

  it("switches p-image-t2i to z-image-turbo when a hosted still URL is present", () => {
    const job = resolveRunPodImageJob({
      primaryModelId: "p-image-t2i",
      primaryEndpointId: "p-image-t2i",
      referenceImageUrl: "https://image.runpod.ai/p-image-t2i/scene-0.png",
    });
    expect(job.spec.id).toBe("z-image-turbo");
    expect(job.endpointId).toBe("z-image-turbo");
    const input = buildRunPodImageJobInput({
      spec: job.spec,
      prompt: "same bird, new camera",
      width: 1280,
      height: 720,
      aspectRatio: "16:9",
      referenceImageUrl: "https://image.runpod.ai/p-image-t2i/scene-0.png",
    });
    expect(input["image"]).toBe("https://image.runpod.ai/p-image-t2i/scene-0.png");
    expect(input["size"]).toBe("1280*720");
    expect(input["strength"]).toBe(0.3);
    expect(input["width"]).toBeUndefined();
  });

  it("sends only prompt + aspect_ratio for p-image-t2i", () => {
    const spec = getRunPodImageModel("p-image-t2i");
    const input = buildRunPodImageJobInput({
      spec,
      prompt: "a coati cub in a moonlit jungle",
      width: 1280,
      height: 720,
      aspectRatio: "16:9",
      steps: 4,
      guidance: 1,
      referenceImage: Buffer.from("x".repeat(200)),
    });
    expect(input).toEqual({
      prompt: "a coati cub in a moonlit jungle",
      aspect_ratio: "16:9",
    });
  });

  it("throws without an API key", () => {
    const prev = process.env["RUNPOD_API_KEY"];
    delete process.env["RUNPOD_API_KEY"];
    expect(() => new RunPodImage({})).toThrow("RUNPOD_API_KEY");
    if (prev) process.env["RUNPOD_API_KEY"] = prev;
  });
});
