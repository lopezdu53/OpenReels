import { describe, expect, it } from "vitest";
import { pickGflowDuration, resolveGflowImageModel, resolveGflowVideoModel } from "./catalog.js";

describe("gflow catalog", () => {
  it("defaults unknown image models to nano2", () => {
    expect(resolveGflowImageModel("nope")).toBe("nano2");
    expect(resolveGflowImageModel("image4")).toBe("image4");
  });

  it("caps duration to what the Veo model accepts", () => {
    expect(pickGflowDuration("veo-lite", 10)).toBe(8);
    expect(pickGflowDuration("omni-flash", 10)).toBe(10);
    expect(pickGflowDuration("veo-lite", 6)).toBe(6);
  });

  it("resolves video models", () => {
    expect(resolveGflowVideoModel("veo-quality").id).toBe("veo-quality");
    expect(resolveGflowVideoModel("missing").id).toBe("veo-lite");
  });
});
