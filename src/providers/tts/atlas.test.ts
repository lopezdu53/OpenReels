import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAtlasTtsModel } from "../atlas/catalog.js";
import {
  atlasLanguageBoost,
  atlasTtsMaxChars,
  atlasTtsRequestBody,
  isRiffWav,
  transcodeAtlasAudioToWav,
} from "./atlas.js";

describe("Atlas TTS request body", () => {
  it("sends xAI voice_id + wav codec", () => {
    const extra = atlasTtsRequestBody({
      spec: resolveAtlasTtsModel("xai/tts-v1"),
      text: "hola",
      voice: "eve",
      speed: 1.2,
      language: "es",
    });
    expect(extra).toMatchObject({
      text: "hola",
      voice_id: "eve",
      codec: "wav",
      speed: 1.2,
    });
    expect(extra.voice).toBeUndefined();
  });

  it("sends Gemini voice + voice_name and does not pretend it is xAI wav", () => {
    const extra = atlasTtsRequestBody({
      spec: resolveAtlasTtsModel("google/gemini-2.5-flash-tts"),
      text: "hola palitos",
      voice: "Kore",
      speed: 1,
      language: "es",
    });
    expect(extra).toEqual({
      text: "hola palitos",
      voice: "Kore",
      voice_name: "Kore",
    });
  });

  it("asks MiniMax for wav + Spanish language_boost", () => {
    const extra = atlasTtsRequestBody({
      spec: resolveAtlasTtsModel("minimax/speech-2.6-turbo"),
      text: "hola",
      voice: "English_expressive_narrator",
      speed: 0.9,
      language: "es",
    });
    expect(extra).toMatchObject({
      text: "hola",
      voice: "English_expressive_narrator",
      format: "wav",
      language_boost: "Spanish",
      speed: 0.9,
    });
    expect(atlasLanguageBoost("es-MX")).toBe("Spanish");
    expect(atlasLanguageBoost("en")).toBe("English");
    expect(atlasTtsMaxChars("google/gemini-2.5-flash-tts")).toBe(10_000);
    expect(atlasTtsMaxChars("xai/tts-v1")).toBe(15_000);
  });
});

describe("Atlas TTS wav transcode", () => {
  it("keeps a RIFF wav as-is", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-wav-"));
    const wav = path.join(root, "ok.wav");
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.3", wav], {
      stdio: "pipe",
    });
    const buf = fs.readFileSync(wav);
    expect(isRiffWav(buf)).toBe(true);
    expect(transcodeAtlasAudioToWav(buf)).toEqual(buf);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("turns MiniMax-style mp3 into a wav the mixer can read", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-mp3-"));
    const mp3 = path.join(root, "voice.mp3");
    execFileSync(
      "ffmpeg",
      ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.4", "-codec:a", "libmp3lame", mp3],
      { stdio: "pipe" },
    );
    const out = transcodeAtlasAudioToWav(fs.readFileSync(mp3));
    expect(isRiffWav(out)).toBe(true);
    expect(out.byteLength).toBeGreaterThan(1000);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
