import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOBY_IMAGE_MODEL,
  DEFAULT_TOBY_VIDEO_MODEL,
  resolveTobyImageModel,
  resolveTobyVideoModel,
  stripTobyLabel,
  tobyFlowImageName,
  tobyFlowVideoName,
  tobyModelLabel,
  TOBY_IMAGE_MODELS,
  TOBY_VIDEO_MODELS,
} from "./catalog.js";

describe("Toby catalog", () => {
  it("labels models as Toby_<id>", () => {
    expect(tobyModelLabel("omni-flash")).toBe("Toby_omni-flash");
    expect(tobyModelLabel("Toby_nano-pro")).toBe("Toby_nano-pro");
    expect(stripTobyLabel("Toby_veo-lite")).toBe("veo-lite");
    expect(TOBY_IMAGE_MODELS.every((m) => m.label.startsWith("Toby_"))).toBe(true);
    expect(TOBY_VIDEO_MODELS.map((m) => m.label)).toContain("Toby_omni-flash");
  });

  it("resolves Flow ids and names", () => {
    expect(resolveTobyImageModel("Toby_nano-pro")).toBe("nano-pro");
    expect(resolveTobyImageModel()).toBe(DEFAULT_TOBY_IMAGE_MODEL);
    expect(resolveTobyVideoModel("Toby_omni-flash").id).toBe(DEFAULT_TOBY_VIDEO_MODEL);
    expect(tobyFlowImageName("nano2")).toBe("Nano Banana 2");
    expect(tobyFlowImageName("Toby_nano-pro")).toBe("Nano Banana Pro");
    expect(tobyFlowImageName("nano-lite")).toBe("Nano Banana 2");
    expect(tobyFlowVideoName("omni-flash")).toBe("Omni Flash");
    expect(tobyFlowVideoName("Toby_veo-lite")).toBe("Veo 3.1 Lite");
  });
});
