import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { draftScriptTemplate } from "./draft.js";
import { generateChainedTakes, stillAtSecond } from "./runner.js";
import type { StickmanJobConfig } from "./types.js";

const DOT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const config: StickmanJobConfig = {
  topic: "patos y palitos",
  durationSec: 20,
  aspect: "9:16",
  language: "es",
  look: "classic",
  castMode: "solo",
  arc: "joke_punchline",
  voiceId: "eve",
  voiceSpeed: 1,
  captions: true,
  animate: true,
  imageModel: "x",
  videoModel: "y",
  atlasTtsModel: "xai/tts-v1",
};

function writeMp4(dest: string, color: string): void {
  execFileSync(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", `color=c=${color}:s=320x180:d=0.4`, "-pix_fmt", "yuv420p", dest],
    { stdio: "pipe" },
  );
}

describe("stickman chained I2V", () => {
  it("picks the still that covers the next take start", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-stillat-"));
    const script = draftScriptTemplate(config, "patos-20s");
    fs.mkdirSync(path.join(root, "stills"));
    for (const beat of script.beats) {
      const rel = `stills/beat-${String(beat.id).padStart(2, "0")}.png`;
      fs.writeFileSync(path.join(root, rel), DOT_PNG);
      beat.stillPath = rel;
    }
    const at10 = stillAtSecond(script, root, 10);
    expect(at10).toContain("beat-03.png");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("always submits take 2 even if last-frame extract fails", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-chain-"));
    const clipsDir = path.join(root, "clips");
    fs.mkdirSync(clipsDir);
    fs.mkdirSync(path.join(root, "stills"));
    const script = draftScriptTemplate(config, "patos-20s");
    const firstStill = path.join(root, "stills/beat-01.png");
    fs.writeFileSync(firstStill, DOT_PNG);
    fs.writeFileSync(path.join(root, "stills/beat-03.png"), DOT_PNG);
    const hook = script.beats[0];
    const later = script.beats[2];
    if (!hook || !later) throw new Error("expected 4 beats");
    hook.stillPath = "stills/beat-01.png";
    later.stillPath = "stills/beat-03.png";

    const sources: number[] = [];
    let n = 0;
    const video = {
      generate: async (opts: { sourceImage: Buffer; durationSeconds?: number }) => {
        sources.push(opts.sourceImage.length);
        n += 1;
        const dest = path.join(root, `gen-${n}.mp4`);
        if (n === 1) {
          fs.writeFileSync(dest, "not a real video");
        } else {
          writeMp4(dest, "blue");
        }
        return { filePath: dest, durationSeconds: opts.durationSeconds ?? 10 };
      },
      supportedDurations: [4, 6, 8, 10],
    };
    const logs: string[] = [];
    const generated = await generateChainedTakes({
      script,
      video: video as never,
      firstStill,
      clipsDir,
      takes: [10, 10],
      log: (line) => logs.push(line),
      retryMs: 1,
      attempts: 2,
    });
    expect(generated).toHaveLength(2);
    expect(fs.existsSync(path.join(clipsDir, "take-02.mp4"))).toBe(true);
    expect(fs.existsSync(path.join(clipsDir, "bridge-01.png"))).toBe(true);
    expect(sources).toHaveLength(2);
    expect(logs.some((line) => line.includes("I2V siguiente"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("retries a failed take and does not skip the rest of the chain", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-retry-"));
    const clipsDir = path.join(root, "clips");
    fs.mkdirSync(clipsDir);
    const script = draftScriptTemplate(config, "patos-20s");
    const firstStill = path.join(root, "still.png");
    fs.writeFileSync(firstStill, DOT_PNG);
    let n = 0;
    const video = {
      generate: async () => {
        n += 1;
        if (n === 2) throw new Error("picker stuck");
        const dest = path.join(root, `gen-${n}.mp4`);
        writeMp4(dest, n === 1 ? "red" : "blue");
        return { filePath: dest, durationSeconds: 10 };
      },
      supportedDurations: [10],
    };
    const generated = await generateChainedTakes({
      script,
      video: video as never,
      firstStill,
      clipsDir,
      takes: [10, 10],
      log: () => undefined,
      retryMs: 1,
      attempts: 3,
    });
    expect(n).toBe(3);
    expect(generated).toHaveLength(2);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("fails the job instead of completing a 20s clip with one take", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-fail-"));
    const clipsDir = path.join(root, "clips");
    fs.mkdirSync(clipsDir);
    const script = draftScriptTemplate(config, "patos-20s");
    const firstStill = path.join(root, "still.png");
    fs.writeFileSync(firstStill, DOT_PNG);
    let n = 0;
    const video = {
      generate: async () => {
        n += 1;
        if (n === 1) {
          const dest = path.join(root, "gen-1.mp4");
          writeMp4(dest, "red");
          return { filePath: dest, durationSeconds: 10 };
        }
        throw new Error("Flow no recibió el take 2");
      },
      supportedDurations: [10],
    };
    await expect(
      generateChainedTakes({
        script,
        video: video as never,
        firstStill,
        clipsDir,
        takes: [10, 10],
        log: () => undefined,
        retryMs: 1,
        attempts: 2,
      }),
    ).rejects.toThrow(/take 2/);
    expect(n).toBe(3);
    expect(fs.existsSync(path.join(clipsDir, "take-01.mp4"))).toBe(true);
    expect(fs.existsSync(path.join(clipsDir, "take-02.mp4"))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not call Flow again when both takes already exist on disk", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-skip-"));
    const clipsDir = path.join(root, "clips");
    fs.mkdirSync(clipsDir);
    const script = draftScriptTemplate(config, "patos-20s");
    const firstStill = path.join(root, "still.png");
    fs.writeFileSync(firstStill, DOT_PNG);
    fs.writeFileSync(path.join(clipsDir, "take-01.mp4"), Buffer.alloc(25_000));
    fs.writeFileSync(path.join(clipsDir, "take-02.mp4"), Buffer.alloc(25_000));
    let n = 0;
    const generated = await generateChainedTakes({
      script,
      video: {
        generate: async () => {
          n += 1;
          throw new Error("should not call Flow");
        },
        supportedDurations: [10],
      } as never,
      firstStill,
      clipsDir,
      takes: [10, 10],
      log: () => undefined,
    });
    expect(n).toBe(0);
    expect(generated).toHaveLength(2);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
