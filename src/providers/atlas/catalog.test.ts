import { describe, expect, it } from "vitest";
import {
  ATLAS_TTS_PER_1K_CHARS,
  DEFAULT_ATLAS_IMAGE_MODEL,
  DEFAULT_ATLAS_LLM_MODEL,
  DEFAULT_ATLAS_LIPSYNC_MODEL,
  DEFAULT_ATLAS_VIDEO_MODEL,
  atlasImageUsd,
  atlasLlmPricing,
  atlasLipSyncPerSecondUsd,
  atlasVideoPerSecondUsd,
  resolveAtlasImageModel,
  resolveAtlasLlmModel,
  resolveAtlasLipSyncModel,
  resolveAtlasVideoModel,
} from "./catalog.js";

describe("atlas catalog", () => {
  it("defaults to the cheapest strong LLM", () => {
    const m = resolveAtlasLlmModel();
    expect(m.id).toBe(DEFAULT_ATLAS_LLM_MODEL);
    expect(m.inputPer1M).toBeLessThan(0.2);
    const p = atlasLlmPricing();
    expect(p.perInputToken).toBeCloseTo(0.14 / 1_000_000);
  });

  it("defaults image to Nano Banana 2 Lite at $0.04", () => {
    expect(resolveAtlasImageModel().id).toBe(DEFAULT_ATLAS_IMAGE_MODEL);
    expect(atlasImageUsd()).toBe(0.04);
    expect(resolveAtlasImageModel().refs).toBe(true);
  });

  it("defaults I2V to Seedance 2.0 Mini at $0.011/s", () => {
    expect(resolveAtlasVideoModel().id).toBe(DEFAULT_ATLAS_VIDEO_MODEL);
    expect(atlasVideoPerSecondUsd()).toBe(0.011);
    expect(resolveAtlasVideoModel().lastFrame).toBe(true);
  });

  it("defaults lip-sync to VEED at $0.013/s", () => {
    expect(resolveAtlasLipSyncModel().id).toBe(DEFAULT_ATLAS_LIPSYNC_MODEL);
    expect(atlasLipSyncPerSecondUsd()).toBe(0.013);
    expect(resolveAtlasLipSyncModel().kind).toBe("video_audio");
  });

  it("prices TTS at $0.015 per 1K chars", () => {
    expect(ATLAS_TTS_PER_1K_CHARS).toBe(0.015);
  });

  it("falls back to defaults on unknown ids", () => {
    expect(resolveAtlasLlmModel("nope").id).toBe(DEFAULT_ATLAS_LLM_MODEL);
    expect(resolveAtlasImageModel("nope").id).toBe(DEFAULT_ATLAS_IMAGE_MODEL);
    expect(resolveAtlasVideoModel("nope").id).toBe(DEFAULT_ATLAS_VIDEO_MODEL);
  });
});
