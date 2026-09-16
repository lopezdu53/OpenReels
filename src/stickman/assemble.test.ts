import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { isMp4Faststart } from "../media/mp4-faststart.js";
import {
  atempoChain,
  concatMotionTakes,
  extractLastFrame,
  mixStickmanAudio,
  singleMotionClip,
  voiceoverFitFilter,
  writeCaptions,
} from "./assemble.js";
import { draftScriptTemplate } from "./draft.js";
import type { StickmanJobConfig } from "./types.js";

const config: StickmanJobConfig = {
  topic: "el wifi",
  durationSec: 10,
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

  it("treats a single I2V path as one continuous take", () => {
    expect(singleMotionClip([null, null, null])).toBeNull();
    expect(singleMotionClip(["/tmp/a.mp4", "/tmp/b.mp4"])).toBeNull();
    expect(singleMotionClip(["/tmp/continuous.mp4", null, null])).toBe("/tmp/continuous.mp4");
  });

  it("extracts the last frame and concatenates two takes without a freeze gap", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-takes-"));
    const a = path.join(root, "a.mp4");
    const b = path.join(root, "b.mp4");
    execFileSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=320x180:d=1",
      "-pix_fmt",
      "yuv420p",
      a,
    ]);
    execFileSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=320x180:d=1",
      "-pix_fmt",
      "yuv420p",
      b,
    ]);
    const frame = extractLastFrame(a, path.join(root, "last.png"));
    expect(fs.statSync(frame).size).toBeGreaterThan(80);
    const dest = path.join(root, "joined.mp4");
    concatMotionTakes([a, b], dest, "16:9");
    const dur = Number(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dest],
        { encoding: "utf8" },
      ).trim(),
    );
    expect(dur).toBeGreaterThan(1.5);
    expect(dur).toBeLessThan(2.3);
    expect(isMp4Faststart(dest)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("extracts the last frame from a fragmented Flow-like mp4 with audio", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-frag-"));
    const clip = path.join(root, "flow.mp4");
    execFileSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=yellow:s=640x360:d=1.2",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:duration=1.2",
      "-shortest",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      "-movflags",
      "frag_keyframe+empty_moov+default_base_moof",
      clip,
    ]);
    const frame = extractLastFrame(clip, path.join(root, "last.png"));
    expect(fs.statSync(frame).size).toBeGreaterThan(80);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("keeps Flow bed audio under TTS and does not cut the video to the voiceover", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-mix-"));
    const clip = path.join(root, "clip.mp4");
    const voice = path.join(root, "voice.wav");
    const dest = path.join(root, "mixed.mp4");
    execFileSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=green:s=320x180:d=1",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=220:duration=1",
      "-shortest",
      "-pix_fmt",
      "yuv420p",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      clip,
    ]);
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=3", voice]);
    mixStickmanAudio(clip, voice, dest, 0.2);
    const dur = Number(
      execFileSync(
        "ffprobe",
        ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", dest],
        { encoding: "utf8" },
      ).trim(),
    );
    const codecs = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "stream=codec_type", "-of", "csv=p=0", dest],
      { encoding: "utf8" },
    );
    expect(codecs).toContain("audio");
    expect(dur).toBeGreaterThan(0.7);
    expect(dur).toBeLessThan(1.6);
    expect(isMp4Faststart(dest)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("delays VO 0.3s and speeds up if it would run into the last 0.5s", () => {
    expect(atempoChain(1)).toBe("");
    expect(atempoChain(1.5)).toContain("atempo=1.5");
    const filter = voiceoverFitFilter(20, 20);
    expect(filter).toContain("adelay=300|300");
    expect(filter).toContain("atempo=");
  });

  it("leaves the first 0.3s and last 0.5s quieter than the spoken window", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "stickman-pad-"));
    const clip = path.join(root, "clip.mp4");
    const voice = path.join(root, "voice.wav");
    const dest = path.join(root, "mixed.mp4");
    execFileSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=black:s=320x180:d=2",
      "-pix_fmt",
      "yuv420p",
      "-an",
      clip,
    ]);
    execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=2", voice]);
    mixStickmanAudio(clip, voice, dest, 0.2);
    const mean = (ss: number, t: number) => {
      const r = spawnSync(
        "ffmpeg",
        [
          "-hide_banner",
          "-ss",
          String(ss),
          "-t",
          String(t),
          "-i",
          dest,
          "-af",
          "volumedetect",
          "-f",
          "null",
          "-",
        ],
        { encoding: "utf8" },
      );
      const m = /mean_volume:\s*([-.\d]+)/.exec(`${r.stdout}\n${r.stderr}`);
      return m ? Number(m[1]) : 0;
    };
    const head = mean(0, 0.2);
    const mid = mean(0.55, 0.5);
    const tail = mean(1.55, 0.4);
    expect(mid).toBeLessThan(-5);
    expect(head).toBeLessThan(mid - 8);
    expect(tail).toBeLessThan(mid - 8);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
