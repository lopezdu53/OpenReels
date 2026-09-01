import { describe, expect, it } from "vitest";
import { RunPodImage } from "./runpod.js";

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

  it("throws without an API key", () => {
    const prev = process.env["RUNPOD_API_KEY"];
    delete process.env["RUNPOD_API_KEY"];
    expect(() => new RunPodImage({})).toThrow("RUNPOD_API_KEY");
    if (prev) process.env["RUNPOD_API_KEY"] = prev;
  });
});
