import { describe, expect, it } from "vitest";
import { resolveStudioVisualProvider, STUDIO_VISUAL_PROVIDERS } from "./visual-provider.js";

describe("studio visual provider", () => {
  it("defaults to Atlas Cloud", () => {
    expect(resolveStudioVisualProvider()).toBe("atlas");
    expect(resolveStudioVisualProvider("atlas")).toBe("atlas");
    expect(resolveStudioVisualProvider("nope")).toBe("atlas");
  });

  it("accepts gflow", () => {
    expect(resolveStudioVisualProvider("gflow")).toBe("gflow");
    expect(STUDIO_VISUAL_PROVIDERS.map((p) => p.key)).toEqual(["atlas", "gflow"]);
  });
});
