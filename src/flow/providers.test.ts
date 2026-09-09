import { describe, expect, it } from "vitest";
import {
  DEFAULT_FLOW_IMAGE,
  DEFAULT_FLOW_TTS,
  DEFAULT_GFLOW_VIDEO_MODE,
  FLOW_IMAGE_PROVIDERS,
  FLOW_TTS_PROVIDERS,
  FLOW_VIDEO_PROVIDERS,
} from "./providers.js";

describe("Nuevo Flow providers", () => {
  it("defaults stills to VIVI, Veo to gflow t2v, voice to Kokoro mix", () => {
    expect(DEFAULT_FLOW_IMAGE).toBe("vivi");
    expect(DEFAULT_FLOW_TTS).toBe("kokoro");
    expect(DEFAULT_GFLOW_VIDEO_MODE).toBe("t2v");
    expect(FLOW_IMAGE_PROVIDERS.map((p) => p.key)).toEqual(["vivi", "atlas", "gflow"]);
    expect(FLOW_VIDEO_PROVIDERS.map((p) => p.key)).toEqual(["gflow"]);
    expect(FLOW_TTS_PROVIDERS.map((p) => p.key)).toEqual([
      "kokoro",
      "atlas-tts",
      "grok-tts",
      "gemini-tts",
    ]);
  });
});
