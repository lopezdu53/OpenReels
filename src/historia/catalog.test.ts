import { describe, expect, it } from "vitest";
import {
  DEFAULT_HISTORIA_ANIMATE,
  DEFAULT_HISTORIA_IMAGE_PROVIDER,
  DEFAULT_HISTORIA_LLM_PROVIDER,
  DEFAULT_HISTORIA_TTS_PROVIDER,
  HISTORIA_IMAGE_PROVIDERS,
  HISTORIA_LLM_PROVIDERS,
  HISTORIA_TTS_PROVIDERS,
  HISTORIA_VIDEO_PROVIDERS,
  historiaEngineCatalog,
} from "./catalog.js";

describe("historia engine catalog", () => {
  it("defaults LLM Cloudflare, TTS xAI, T2I Cloudflare, I2V off", () => {
    expect(DEFAULT_HISTORIA_LLM_PROVIDER).toBe("cloudflare");
    expect(DEFAULT_HISTORIA_TTS_PROVIDER).toBe("grok-tts");
    expect(DEFAULT_HISTORIA_IMAGE_PROVIDER).toBe("cloudflare");
    expect(DEFAULT_HISTORIA_ANIMATE).toBe(false);
    const cat = historiaEngineCatalog();
    expect(cat.defaultLlm.startsWith("@cf/")).toBe(true);
    expect(cat.defaultImageModel.startsWith("@cf/")).toBe(true);
  });

  it("lists every LLM / TTS / T2I / I2V family with models", () => {
    expect(HISTORIA_LLM_PROVIDERS.map((p) => p.key)).toContain("cloudflare");
    expect(HISTORIA_LLM_PROVIDERS.every((p) => p.models.length > 0)).toBe(true);
    expect(HISTORIA_TTS_PROVIDERS.map((p) => p.key)).toEqual(
      expect.arrayContaining(["grok-tts", "atlas-tts", "kokoro", "elevenlabs", "cloudflare-tts"]),
    );
    expect(HISTORIA_IMAGE_PROVIDERS.map((p) => p.key)).toEqual(
      expect.arrayContaining(["cloudflare", "toby", "gflow", "atlas", "gemini", "openai"]),
    );
    expect(HISTORIA_VIDEO_PROVIDERS.map((p) => p.key)).toEqual(
      expect.arrayContaining(["toby", "gflow", "atlas", "gemini", "fal"]),
    );
  });
});
