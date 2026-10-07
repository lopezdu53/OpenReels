import { describe, expect, it } from "vitest";
import {
  isNaraDuration,
  isNaraTtsKey,
  NARA_TTS_PROVIDERS,
  naraProvider,
  targetWordCount,
} from "./catalog.js";

describe("nara catalog", () => {
  it("lists every TTS provider with a category and voice or model options", () => {
    const keys = NARA_TTS_PROVIDERS.map((p) => p.key);
    expect(keys).toEqual([
      "kokoro",
      "cloudflare-tts",
      "atlas-tts",
      "grok-tts",
      "gemini-tts",
      "openai-tts",
      "elevenlabs",
      "inworld",
    ]);
    for (const p of NARA_TTS_PROVIDERS) {
      expect(p.category.length).toBeGreaterThan(0);
      expect(p.voices.length + p.models.length).toBeGreaterThan(0);
    }
  });

  it("maps duration to ~150 wpm", () => {
    expect(targetWordCount(30)).toBe(75);
    expect(targetWordCount(60)).toBe(150);
    expect(isNaraDuration(30)).toBe(true);
    expect(isNaraDuration(12)).toBe(false);
  });

  it("resolves atlas models with nested voices", () => {
    expect(isNaraTtsKey("atlas-tts")).toBe(true);
    const atlas = naraProvider("atlas-tts");
    expect(atlas.models.some((m) => (m.voices?.length ?? 0) > 0)).toBe(true);
  });
});
