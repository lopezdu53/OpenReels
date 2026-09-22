import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { draftScriptTemplate } from "./draft.js";
import type { StickmanJobConfig } from "./types.js";
import {
  buildContinuousMotionPrompt,
  buildStillPrompt,
  castLock,
  motionNegativePrompt,
  pickMotionDuration,
  renderStills,
  stickmanI2vNegative,
} from "./visuals.js";

const config: StickmanJobConfig = {
  topic: "el wifi de la oficina",
  durationSec: 10,
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
    expect(prompt.toLowerCase()).toContain("no blur");
    expect(prompt.toLowerCase()).toContain("no push-in");
    expect(prompt).toContain("chalk");
  });

  it("builds historia stills from the casting lock, not stickman style", () => {
    const script = draftScriptTemplate(
      {
        ...config,
        kind: "historia",
        look: "casting",
        castRoster: [
          {
            id: "c1",
            name: "Rayitas",
            kind: "animal",
            species: "tigrillo",
            appearance: "ocelos pálidos",
          },
        ],
      },
      "rayitas-10s",
    );
    const prompt = buildStillPrompt(script, script.beats[0]!);
    expect(prompt).toContain("Rayitas");
    expect(prompt).toContain("Casting");
    expect(prompt.toLowerCase()).toContain("no stick figures");
    expect(prompt).not.toContain("STICKMAN");
  });

  it("renders stills through the injected image provider (Atlas or gflow)", async () => {
    const script = draftScriptTemplate({ ...config, durationSec: 10 }, "wifi-10s");
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

  it("reuses stills already on disk instead of calling the image provider", async () => {
    const script = draftScriptTemplate({ ...config, durationSec: 10 }, "wifi-10s");
    script.beats = script.beats.slice(0, 1);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-still-skip-"));
    fs.mkdirSync(path.join(root, "stills"));
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    fs.writeFileSync(
      path.join(root, "stills", "beat-01.png"),
      Buffer.concat([png, Buffer.alloc(1200)]),
    );
    let calls = 0;
    await renderStills(
      root,
      script,
      {
        generate: async () => {
          calls += 1;
          throw new Error("should not generate");
        },
      },
      () => {},
    );
    expect(calls).toBe(0);
    expect(script.beats[0]?.stillPath).toBe("stills/beat-01.png");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("writes a continuous I2V prompt with timed beats and no-cut language", () => {
    const script = draftScriptTemplate({ ...config, durationSec: 20, animate: true }, "wifi-20s");
    const prompt = buildContinuousMotionPrompt(script, 10);
    expect(prompt).toContain("NO CUTS");
    expect(prompt).toContain("[0.0–");
    expect(prompt.toLowerCase()).toContain("morph");
    expect(prompt.toLowerCase()).toContain("no push-in");
    expect(prompt.toLowerCase()).toContain("no blur");
    expect(pickMotionDuration([4, 6, 8], 20)).toBe(8);
    expect(pickMotionDuration([4, 6, 8, 10], 10)).toBe(10);
  });

  it("windows a later take so it continues from the last frame", () => {
    const script = draftScriptTemplate({ ...config, durationSec: 20, animate: true }, "wifi-20s");
    const prompt = buildContinuousMotionPrompt(script, 10, {
      startSec: 10,
      takeIndex: 1,
      takeCount: 2,
    });
    expect(prompt).toContain("CONTINUE");
    expect(prompt).toContain("2/2");
    expect(prompt).toContain("[0.0–");
  });

  it("bans blur, DOF and push-in only on palito I2V, not historia", () => {
    expect(stickmanI2vNegative().toLowerCase()).toContain("blur");
    expect(stickmanI2vNegative().toLowerCase()).toContain("push-in");
    expect(stickmanI2vNegative().toLowerCase()).toContain("shallow depth of field");
    const palito = draftScriptTemplate({ ...config, durationSec: 20, animate: true }, "wifi-20s");
    expect(motionNegativePrompt(palito)).toBe(stickmanI2vNegative());
    const historia = draftScriptTemplate(
      {
        ...config,
        kind: "historia",
        look: "casting",
        durationSec: 20,
        animate: true,
        castRoster: [{ id: "c1", name: "Rayitas", kind: "animal", appearance: "ocelos" }],
      },
      "rayitas-20s",
    );
    const historiaMotion = buildContinuousMotionPrompt(historia, 10);
    expect(historiaMotion.toLowerCase()).not.toContain("no push-in");
    expect(motionNegativePrompt(historia).toLowerCase()).not.toContain("push-in");
  });

  it("marks the first take as a content hook trailer", () => {
    const script = draftScriptTemplate(
      { ...config, durationSec: 300, animate: true, contentHook: true },
      "wifi-5m",
    );
    const prompt = buildContinuousMotionPrompt(script, 10, {
      startSec: 0,
      takeIndex: 0,
      takeCount: 30,
    });
    expect(prompt).toContain("CONTENT HOOK");
  });
});
