import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { writeCaptions } from "./assemble.js";
import { draftScriptTemplate } from "./draft.js";
import type { StickmanJobConfig } from "./types.js";

const config: StickmanJobConfig = {
  topic: "el wifi",
  durationSec: 15,
  aspect: "9:16",
  language: "es",
  look: "classic",
  castMode: "solo",
  arc: "joke_punchline",
  voiceId: "eve",
  voiceSpeed: 1,
  captions: true,
  animate: false,
  imageModel: "x",
  videoModel: "y",
  atlasTtsModel: "xai/tts-v1",
};

describe("stickman assemble captions", () => {
  it("writes an SRT from beat narration", () => {
    const script = draftScriptTemplate(config, "wifi-15s");
    const dest = path.join(os.tmpdir(), `stickman-cap-${Date.now()}.srt`);
    const written = writeCaptions(script, dest);
    expect(written).toBe(dest);
    const text = fs.readFileSync(dest, "utf-8");
    expect(text).toContain("-->");
    expect(text).toContain(script.beats[0]!.narration);
    fs.unlinkSync(dest);
  });

  it("skips captions when disabled", () => {
    const script = draftScriptTemplate({ ...config, captions: false }, "wifi-15s");
    script.captions = false;
    expect(writeCaptions(script, "/tmp/unused.srt")).toBeNull();
  });
});
