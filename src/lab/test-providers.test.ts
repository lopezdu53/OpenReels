import { describe, expect, it } from "vitest";
import { GflowImage } from "../providers/image/gflow.js";
import { GflowVideo } from "../providers/video/gflow.js";
import { createLabImageProvider, createLabVideoProvider, labVideoRequiresStill } from "./test-providers.js";

describe("Lab test providers", () => {
  it("routes gflow image to GflowImage, not Gemini", () => {
    expect(createLabImageProvider({ provider: "gflow", model: "nano2" })).toBeInstanceOf(GflowImage);
  });

  it("routes gflow video to GflowVideo t2v by default", () => {
    expect(createLabVideoProvider({ provider: "gflow", model: "veo-lite" })).toBeInstanceOf(GflowVideo);
    expect(createLabVideoProvider({ provider: "gflow", mode: "t2v" })).toBeInstanceOf(GflowVideo);
  });

  it("does not require a still for gflow t2v", () => {
    expect(labVideoRequiresStill("gflow", "t2v")).toBe(false);
    expect(labVideoRequiresStill("gflow", "i2v")).toBe(true);
    expect(labVideoRequiresStill("atlas", "t2v")).toBe(true);
  });
});
