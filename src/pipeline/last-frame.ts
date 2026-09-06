import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

/**
 * Grab the last video frame so the next I2V clip can start there (match-cut).
 * Returns false when ffmpeg is missing or the file is unreadable.
 */
export function extractLastFrame(videoPath: string, destPath: string): boolean {
  if (!videoPath || !destPath || !fs.existsSync(videoPath)) return false;
  try {
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-sseof",
        "-0.12",
        "-i",
        videoPath,
        "-frames:v",
        "1",
        "-update",
        "1",
        destPath,
      ],
      { stdio: "pipe" },
    );
    return fs.existsSync(destPath) && fs.statSync(destPath).size > 80;
  } catch {
    return false;
  }
}
