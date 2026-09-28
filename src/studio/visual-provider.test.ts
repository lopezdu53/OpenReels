import { describe, expect, it } from "vitest";
import {
  DEFAULT_HISTORIA_VISUAL_PROVIDER,
  resolveHistoriaVisualProvider,
  resolveStudioVisualProvider,
  STUDIO_VISUAL_PROVIDERS,
} from "./visual-provider.js";

describe("studio visual provider", () => {
  it("defaults to Atlas Cloud outside Historia", () => {
    expect(resolveStudioVisualProvider()).toBe("atlas");
    expect(resolveStudioVisualProvider("atlas")).toBe("atlas");
    expect(resolveStudioVisualProvider("nope")).toBe("atlas");
  });

  it("accepts VIVI, Atlas and gflow", () => {
    expect(resolveStudioVisualProvider("vivi")).toBe("vivi");
    expect(resolveStudioVisualProvider("gflow")).toBe("gflow");
    expect(STUDIO_VISUAL_PROVIDERS.map((p) => p.key)).toEqual(["vivi", "atlas", "gflow"]);
  });

  it("defaults Nueva Historia stills to VIVI", () => {
    expect(DEFAULT_HISTORIA_VISUAL_PROVIDER).toBe("vivi");
    expect(resolveHistoriaVisualProvider()).toBe("vivi");
    expect(resolveHistoriaVisualProvider("nope")).toBe("vivi");
    expect(resolveHistoriaVisualProvider("atlas")).toBe("atlas");
    expect(resolveHistoriaVisualProvider("gflow")).toBe("gflow");
  });
});
