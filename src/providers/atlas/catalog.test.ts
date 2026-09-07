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
  resolveAtlasTtsModel,
  resolveAtlasVideoModel,
  ATLAS_TTS_MODELS,
  ATLAS_VIDEO_MODELS,
  sortedAtlasImageModels,
  sortedAtlasLipSyncModels,
  sortedAtlasLlmModels,
  sortedAtlasVideoModels,
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

  it("lists models cheapest to most expensive", () => {
    const images = sortedAtlasImageModels();
    const llms = sortedAtlasLlmModels();
    const videos = sortedAtlasVideoModels();
    const lips = sortedAtlasLipSyncModels();
    expect(images[0]!.usd).toBeLessThanOrEqual(images.at(-1)!.usd);
    expect(llms[0]!.inputPer1M + llms[0]!.outputPer1M).toBeLessThanOrEqual(
      llms.at(-1)!.inputPer1M + llms.at(-1)!.outputPer1M,
    );
    expect(videos[0]!.usdPerSecond).toBeLessThanOrEqual(videos.at(-1)!.usdPerSecond);
    expect(lips[0]!.usdPerSecond).toBeLessThanOrEqual(lips.at(-1)!.usdPerSecond);
  });

  it("keeps GPT Image 2 identity edits and Seedance Mini as default I2V", () => {
    expect(resolveAtlasImageModel("openai/gpt-image-2/text-to-image").refs).toBe(true);
    expect(resolveAtlasImageModel("openai/gpt-image-2/text-to-image").editId).toContain("edit");
    expect(ATLAS_VIDEO_MODELS.some((m) => m.id === "kwaivgi/kling-v3.0-std/image-to-video")).toBe(true);
    expect(ATLAS_VIDEO_MODELS.some((m) => m.id === "bytedance/seedance-v1.5-pro/image-to-video")).toBe(true);
  });

  it("exposes several TTS models with per-model voices", () => {
    expect(ATLAS_TTS_MODELS.length).toBeGreaterThanOrEqual(4);
    expect(resolveAtlasTtsModel("google/gemini-2.5-flash-tts").voiceField).toBe("voice");
    expect(resolveAtlasTtsModel("xai/tts-v1").voices.some((v) => v.id === "eve")).toBe(true);
  });
});
