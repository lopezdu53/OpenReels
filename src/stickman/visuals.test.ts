import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { draftScriptTemplate } from "./draft.js";
import type { StickmanJobConfig } from "./types.js";
import { buildStillPrompt, castLock, renderStills } from "./visuals.js";

const config: StickmanJobConfig = {
  topic: "el wifi de la oficina",
  durationSec: 15,
  aspect: "9:16",
  language: "es",
  look: "chalk",
  castMode: "duo",
  arc: "vs_debate",
  voiceId: "eve",
  voiceSpeed: 1,
  captions: true,
  animate: false,
  imageModel: "x",
  videoModel: "y",
  atlasTtsModel: "xai/tts-v1",
};

describe("stickman visuals", () => {
  it("locks both stick figures and forbids collage/hero language in the still prompt", () => {
    const script = draftScriptTemplate(config, "wifi-15s");
    const prompt = buildStillPrompt(script, script.beats[0]!);
    expect(castLock(script)).toContain("Palo");
    expect(castLock(script)).toContain("Línea");
    expect(prompt).toContain("STICKMAN");
    expect(prompt.toLowerCase()).toContain("no paper collage");
    expect(prompt.toLowerCase()).toContain("no sphere-head");
    expect(prompt).toContain("chalk");
  });

  it("renders stills through the injected image provider (Atlas or gflow)", async () => {
    const script = draftScriptTemplate({ ...config, durationSec: 15 }, "wifi-15s");
    script.beats = script.beats.slice(0, 1);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-stills-"));
    const calls: string[] = [];
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const fat = Buffer.concat([png, Buffer.alloc(1200)]);
    await renderStills(
      root,
      script,
      {
        generate: async (prompt) => {
          calls.push(prompt);
          return fat;
        },
      },
      () => {},
    );
    expect(calls).toHaveLength(1);
    expect(fs.existsSync(path.join(root, "stills", "beat-01.png"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
