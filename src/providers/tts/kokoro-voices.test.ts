import { describe, expect, it } from "vitest";
import {
  DEFAULT_KOKORO_VOICE,
  isKokoroEnglishVoice,
  KOKORO_LANG_TO_PHONEME,
  KOKORO_VOICES,
} from "./kokoro-voices.js";

describe("KOKORO_VOICES", () => {
  it("includes Spanish voices and defaults to ef_dora", () => {
    const ids = KOKORO_VOICES.map((v) => v.id);
    expect(ids).toContain("ef_dora");
    expect(ids).toContain("em_alex");
    expect(ids).toContain("em_santa");
    expect(DEFAULT_KOKORO_VOICE).toBe("ef_dora");
    expect(KOKORO_VOICES.filter((v) => v.language === "es")).toHaveLength(3);
  });

  it("maps Spanish voice prefix to eSpeak es", () => {
    expect(KOKORO_LANG_TO_PHONEME["e"]).toBe("es");
    expect(isKokoroEnglishVoice("ef_dora")).toBe(false);
    expect(isKokoroEnglishVoice("af_heart")).toBe(true);
    expect(isKokoroEnglishVoice("bf_emma")).toBe(true);
  });
});
