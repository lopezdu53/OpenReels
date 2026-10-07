import { describe, expect, it } from "vitest";
import { KokoroTTS } from "../providers/tts/kokoro.js";
import { createNaraTts } from "./tts.js";

describe("createNaraTts", () => {
  it("builds Kokoro without cloud keys", () => {
    const tts = createNaraTts({
      idea: "test",
      durationSec: 15,
      language: "es",
      tone: "neutral",
      ttsProvider: "kokoro",
      voice: "ef_dora",
      speed: 1.1,
    });
    expect(tts).toBeInstanceOf(KokoroTTS);
  });
});
