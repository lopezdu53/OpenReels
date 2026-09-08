import { describe, expect, it } from "vitest";
import { DEFAULT_FLOW_IMAGE, FLOW_IMAGE_PROVIDERS, FLOW_VIDEO_PROVIDERS } from "./providers.js";

describe("Nuevo Flow providers", () => {
  it("defaults stills to Atlas because gflow image t2i is blocked on migrated Flow", () => {
    expect(DEFAULT_FLOW_IMAGE).toBe("atlas");
    expect(FLOW_IMAGE_PROVIDERS.map((p) => p.key)).toEqual(["atlas", "vivi", "gflow"]);
    expect(FLOW_VIDEO_PROVIDERS.map((p) => p.key)).toEqual(["gflow"]);
  });
});
