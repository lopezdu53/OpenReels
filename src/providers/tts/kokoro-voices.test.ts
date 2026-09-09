import { describe, expect, it } from "vitest";
import {
  DEFAULT_KOKORO_VOICE,
  isKokoroEnglishVoice,
  KOKORO_LANG_TO_PHONEME,
  KOKORO_VOICES,
  mixVoiceEmbeddings,
  parseKokoroVoiceSpec,
  serializeKokoroVoiceSpec,
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
    expect(KOKORO_LANG_TO_PHONEME["p"]).toBe("pt-br");
    expect(isKokoroEnglishVoice("ef_dora")).toBe(false);
    expect(isKokoroEnglishVoice("af_heart")).toBe(true);
    expect(isKokoroEnglishVoice("bf_emma")).toBe(true);
    expect(isKokoroEnglishVoice("ef_dora:70+em_alex:30")).toBe(false);
  });
});

describe("Kokoro voice blending", () => {
  it("parses a single voice id", () => {
    expect(parseKokoroVoiceSpec("em_alex")).toEqual({
      parts: [{ id: "em_alex", weight: 1 }],
      primaryId: "em_alex",
    });
  });

  it("parses weighted Spanish mixes and serializes percents", () => {
    const blend = parseKokoroVoiceSpec("ef_dora:70+em_alex:30");
    expect(blend.primaryId).toBe("ef_dora");
    expect(blend.parts[0]?.weight).toBeCloseTo(0.7);
    expect(blend.parts[1]?.weight).toBeCloseTo(0.3);
    expect(
      serializeKokoroVoiceSpec([
        { id: "ef_dora", weight: 70 },
        { id: "em_alex", weight: 30 },
      ]),
    ).toBe("ef_dora:70+em_alex:30");
  });

  it("mixes embeddings by weight", () => {
    const a = new Float32Array([0, 10]);
    const b = new Float32Array([10, 0]);
    const mixed = mixVoiceEmbeddings([
      { data: a, weight: 0.5 },
      { data: b, weight: 0.5 },
    ]);
    expect([...mixed]).toEqual([5, 5]);
  });
});
