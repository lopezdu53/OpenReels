import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ensureMp4Faststart,
  isMp4Faststart,
  mp4TopBoxes,
  remuxMp4Faststart,
} from "./mp4-faststart.js";

function makeClip(dest: string, faststart: boolean): void {
  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=red:s=160x90:d=0.4",
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
  ];
  if (faststart) args.push("-movflags", "+faststart");
  args.push(dest);
  execFileSync("ffmpeg", args, { stdio: "pipe" });
}

describe("mp4 faststart", () => {
  it("detects moov after mdat and remuxes it to the front", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp4-fast-"));
    const src = path.join(root, "tail.mp4");
    const dest = path.join(root, "head.mp4");
    makeClip(src, false);
    const before = mp4TopBoxes(src);
    expect(before.mdat).toBeGreaterThanOrEqual(0);
    expect(before.moov).toBeGreaterThan(before.mdat);
    expect(isMp4Faststart(src)).toBe(false);
    remuxMp4Faststart(src, dest);
    const after = mp4TopBoxes(dest);
    expect(after.moov).toBeGreaterThanOrEqual(0);
    expect(after.moov).toBeLessThan(after.mdat);
    expect(isMp4Faststart(dest)).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rewrites an existing job artifact in place on first serve", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "mp4-serve-"));
    const file = path.join(root, "final.mp4");
    makeClip(file, false);
    expect(isMp4Faststart(file)).toBe(false);
    expect(ensureMp4Faststart(file)).toBe(file);
    expect(isMp4Faststart(file)).toBe(true);
    expect(ensureMp4Faststart(file)).toBe(file);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
