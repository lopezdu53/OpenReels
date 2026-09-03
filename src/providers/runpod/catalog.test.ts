import { describe, expect, it } from "vitest";
import {
  canonicalizeRunPodImageModelId,
  canonicalizeRunPodVideoModelId,
  DEFAULT_RUNPOD_IMAGE_MODEL,
  DEFAULT_RUNPOD_VIDEO_MODEL,
  getRunPodImageModel,
  getRunPodVideoModel,
  isRunPodPublicModelId,
  RUNPOD_IMAGE_MODELS,
  RUNPOD_VIDEO_MODELS,
} from "./catalog.js";

describe("RunPod catalog", () => {
  it("defaults to the cheapest public endpoints", () => {
    expect(DEFAULT_RUNPOD_IMAGE_MODEL).toBe("p-image-t2i");
    expect(DEFAULT_RUNPOD_VIDEO_MODEL).toBe("p-video");
    expect(getRunPodImageModel(undefined).id).toBe(DEFAULT_RUNPOD_IMAGE_MODEL);
    expect(getRunPodVideoModel(undefined).id).toBe(DEFAULT_RUNPOD_VIDEO_MODEL);
  });

  it("maps legacy AI-SDK ids to REST public-endpoint slugs", () => {
    expect(canonicalizeRunPodImageModelId("tongyi-mai/z-image-turbo")).toBe("z-image-turbo");
    expect(canonicalizeRunPodVideoModelId("alibaba/wan-2.2-i2v-720")).toBe("wan-2-2-i2v-720");
    expect(getRunPodVideoModel("alibaba/wan-2.6-i2v").id).toBe("wan-2-6-i2v");
  });

  it("treats UUIDs as custom serverless endpoints", () => {
    expect(isRunPodPublicModelId("black-forest-labs-flux-1-schnell")).toBe(true);
    expect(isRunPodPublicModelId("p-video")).toBe(true);
    expect(isRunPodPublicModelId("custom")).toBe(false);
    expect(isRunPodPublicModelId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(false);
  });

  it("hides inference steps for models that do not expose them", () => {
    expect(getRunPodImageModel("z-image-turbo").maxSteps).toBeUndefined();
    expect(getRunPodImageModel("p-image-t2i").sizeMode).toBe("aspect");
    expect(getRunPodImageModel("z-image-turbo").supportsReference).toBe("url");
    expect(getRunPodImageModel("black-forest-labs-flux-1-schnell").maxSteps).toBe(8);
  });

  it("lists current public I2V models", () => {
    const ids = RUNPOD_VIDEO_MODELS.map((m) => m.id);
    expect(ids).toContain("p-video");
    expect(ids).toContain("wan-2-6-i2v");
    expect(ids).toContain("seedance-v1-5-pro-i2v");
    expect(RUNPOD_IMAGE_MODELS.some((m) => m.id === "qwen-image-t2i")).toBe(true);
  });

  it("marks p-video as needing a nested WaveSpeed input object", () => {
    expect(getRunPodVideoModel("p-video").nestedInput).toBe(true);
    expect(getRunPodVideoModel("wan-2-6-i2v").nestedInput).toBeUndefined();
  });
});
