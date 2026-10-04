import { describe, expect, it } from "vitest";
import { resolveAllowedVisualTypes } from "./visual-types.js";

describe("resolveAllowedVisualTypes", () => {
  it("returns undefined when stock is available and the caller did not restrict types", () => {
    expect(
      resolveAllowedVisualTypes({ videoEnabled: true, stockEnabled: true }),
    ).toBeUndefined();
  });

  it("drops stock types when no stock providers are configured", () => {
    expect(
      resolveAllowedVisualTypes({ videoEnabled: false, stockEnabled: false }),
    ).toEqual(["ai_image", "text_card"]);
  });

  it("keeps ai_video when video is enabled and stock is missing", () => {
    expect(
      resolveAllowedVisualTypes({ videoEnabled: true, stockEnabled: false }),
    ).toEqual(["ai_image", "text_card", "ai_video"]);
  });

  it("filters stock and ai_video out of an explicit list", () => {
    expect(
      resolveAllowedVisualTypes({
        requested: ["ai_image", "stock_image", "stock_video", "text_card", "ai_video"],
        videoEnabled: false,
        stockEnabled: false,
      }),
    ).toEqual(["ai_image", "text_card"]);
  });

  it("keeps requested stock types when stock providers exist", () => {
    expect(
      resolveAllowedVisualTypes({
        requested: ["ai_image", "stock_video", "text_card"],
        videoEnabled: true,
        stockEnabled: true,
      }),
    ).toEqual(["ai_image", "stock_video", "text_card"]);
  });

  it("falls back to ai_image + text_card when the requested list is only unavailable types", () => {
    expect(
      resolveAllowedVisualTypes({
        requested: ["stock_image", "stock_video"],
        videoEnabled: false,
        stockEnabled: false,
      }),
    ).toEqual(["ai_image", "text_card"]);
  });

  it("strips text_card for Film even if it was requested", () => {
    expect(
      resolveAllowedVisualTypes({
        requested: ["ai_image", "text_card", "ai_video"],
        videoEnabled: true,
        stockEnabled: true,
        forbidTextCard: true,
      }),
    ).toEqual(["ai_image", "ai_video"]);
  });
});
