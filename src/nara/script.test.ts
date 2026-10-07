import { describe, expect, it } from "vitest";
import { fallbackScript } from "./script.js";

describe("nara script", () => {
  it("builds a spoken fallback from the idea", () => {
    const doc = fallbackScript({
      idea: "Por qué el café de la tarde quita el sueño",
      durationSec: 30,
      language: "es",
      tone: "news",
      ttsProvider: "kokoro",
    });
    expect(doc.script).toContain("café");
    expect(doc.script.includes("*")).toBe(false);
    expect(doc.targetWords).toBe(75);
  });
});
