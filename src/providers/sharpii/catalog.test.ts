import { describe, expect, it } from "vitest";
import {
  creditsToUsd,
  resolveSharpiiImageModel,
  resolveSharpiiVideoModel,
  sharpiiImageUsd,
  sharpiiVideoUsd,
} from "./catalog.js";

describe("Sharpii catalog", () => {
  it("prices Nano Banana 2 near $0.036 on the Creator yearly rate", () => {
    expect(creditsToUsd(65)).toBeCloseTo(0.036, 3);
    expect(sharpiiImageUsd("nano-banana-2")).toBe(creditsToUsd(65));
  });

  it("falls back to the default image model", () => {
    expect(resolveSharpiiImageModel("nope").id).toBe("nano-banana-2");
  });

  it("scales Seedance per-second credits", () => {
    expect(resolveSharpiiVideoModel("seedance-2.0-fast-720p").perSecond).toBe(true);
    const five = sharpiiVideoUsd("seedance-2.0-fast-720p", 5);
    const ten = sharpiiVideoUsd("seedance-2.0-fast-720p", 10);
    expect(ten).toBeCloseTo(five * 2, 3);
  });

  it("keeps Kling 2.6 flat for 5s and 10s", () => {
    expect(sharpiiVideoUsd("kling-v2.6-pro-i2v", 5)).toBe(sharpiiVideoUsd("kling-v2.6-pro-i2v", 10));
  });

  it("uses official Seedream 5.0 2K model id and credits", () => {
    expect(resolveSharpiiImageModel("doubao-seedream-5-0-260128").credits).toBe(108);
  });

  it("scales Sora 2 from the 10s base to 15s", () => {
    expect(sharpiiVideoUsd("sora-2", 15)).toBe(creditsToUsd(1335));
  });
});
