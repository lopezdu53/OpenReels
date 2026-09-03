import { describe, expect, it } from "vitest";
import { getRunPodImageModel } from "../runpod/catalog.js";
import { buildRunPodImageJobInput, RunPodImage } from "./runpod.js";

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

  it("throws without an API key", () => {
    const prev = process.env["RUNPOD_API_KEY"];
    delete process.env["RUNPOD_API_KEY"];
    expect(() => new RunPodImage({})).toThrow("RUNPOD_API_KEY");
    if (prev) process.env["RUNPOD_API_KEY"] = prev;
  });
});
