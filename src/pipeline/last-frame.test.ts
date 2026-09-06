import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { extractLastFrame } from "./last-frame.js";

describe("extractLastFrame", () => {
  it("returns false when the video is missing", () => {
    expect(extractLastFrame("/tmp/openreels-no-such.mp4", "/tmp/openreels-no-such.png")).toBe(false);
  });

  it("writes the last frame of a short clip when ffmpeg is available", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "or-last-"));
    const video = path.join(dir, "clip.mp4");
    const dest = path.join(dir, "last.png");
    try {
      execFileSync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-f",
          "lavfi",
          "-i",
          "color=c=red:s=64x64:d=0.4",
          "-pix_fmt",
          "yuv420p",
          video,
        ],
        { stdio: "pipe" },
      );
    } catch {
      return;
    }
    expect(extractLastFrame(video, dest)).toBe(true);
    expect(fs.statSync(dest).size).toBeGreaterThan(80);
  });
});
