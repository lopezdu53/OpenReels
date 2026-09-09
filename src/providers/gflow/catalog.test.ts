import { describe, expect, it } from "vitest";
import {
  gflowCliDuration,
  gflowI2vFallbackT2vEnabled,
  gflowI2vShouldFallbackT2v,
  gflowSupportsDurationFlag,
  pickGflowDuration,
  resolveGflowImageModel,
  resolveGflowVideoMode,
  resolveGflowVideoModel,
  shouldSerializeGflowI2v,
} from "./catalog.js";

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

  it("defaults Veo mode to t2v", () => {
    expect(resolveGflowVideoMode()).toBe("t2v");
    expect(resolveGflowVideoMode("t2v")).toBe("t2v");
    expect(resolveGflowVideoMode("i2v")).toBe("i2v");
    expect(resolveGflowVideoMode("nope")).toBe("t2v");
  });

  it("serializes VIVI still + Flow I2V one scene at a time", () => {
    expect(shouldSerializeGflowI2v("gflow", "i2v")).toBe(true);
    expect(shouldSerializeGflowI2v("gflow", "t2v")).toBe(false);
    expect(shouldSerializeGflowI2v("atlas", "i2v")).toBe(false);
    expect(gflowI2vFallbackT2vEnabled()).toBe(false);
  });

  it("falls back I2V to t2v when the migrated picker sticks", () => {
    expect(
      gflowI2vShouldFallbackT2v(
        "UiSelectorDriftError — migrated host: the frame picker stayed open 15s after picking 'still.png'",
      ),
    ).toBe(true);
    expect(gflowI2vShouldFallbackT2v("no maseQ reply within 60s")).toBe(true);
    expect(gflowI2vShouldFallbackT2v("Token inválido")).toBe(false);
  });

  it("only sends --duration for Omni Flash", () => {
    expect(gflowSupportsDurationFlag("veo-lite")).toBe(false);
    expect(gflowSupportsDurationFlag("veo-fast")).toBe(false);
    expect(gflowCliDuration("veo-lite", 4)).toBeUndefined();
    expect(gflowSupportsDurationFlag("omni-flash")).toBe(true);
    expect(gflowCliDuration("omni-flash", 10)).toBe(10);
  });
});
