import { describe, expect, it } from "vitest";
import {
  createStudioImage,
  createStudioVideo,
  resolveStickmanVisualProvider,
  resolveStudioVisualProvider,
  STICKMAN_VISUAL_PROVIDERS,
  STUDIO_VISUAL_PROVIDERS,
} from "./visual-provider.js";
import { GflowImage } from "../providers/image/gflow.js";
import { TobyImage } from "../providers/image/toby.js";
import { TobyVideo } from "../providers/video/toby.js";

describe("studio visual provider", () => {
  it("defaults to Atlas Cloud", () => {
    expect(resolveStudioVisualProvider()).toBe("atlas");
    expect(resolveStudioVisualProvider("atlas")).toBe("atlas");
    expect(resolveStudioVisualProvider("nope")).toBe("atlas");
    expect(resolveStudioVisualProvider("toby")).toBe("atlas");
    expect(resolveStickmanVisualProvider("toby")).toBe("toby");
  });

  it("accepts gflow on shared studio surfaces", () => {
    expect(resolveStudioVisualProvider("gflow")).toBe("gflow");
    expect(STUDIO_VISUAL_PROVIDERS.map((p) => p.key)).toEqual(["atlas", "gflow"]);
  });

  it("lists Toby first on Stickman only", () => {
    expect(STICKMAN_VISUAL_PROVIDERS.map((p) => p.key)).toEqual(["toby", "gflow", "atlas"]);
    expect(resolveStickmanVisualProvider()).toBe("toby");
    expect(resolveStickmanVisualProvider("toby")).toBe("toby");
    expect(createStudioImage({ visualProvider: "toby" })).toBeInstanceOf(TobyImage);
    expect(createStudioImage({ visualProvider: "gflow" })).toBeInstanceOf(GflowImage);
    expect(createStudioVideo({ visualProvider: "toby" })).toBeInstanceOf(TobyVideo);
  });
});
