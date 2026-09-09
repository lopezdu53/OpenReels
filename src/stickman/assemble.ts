import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { frameSize } from "./catalog.js";
import type { StickmanScript } from "./types.js";

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", args, { stdio: "pipe" });
}

function escapeSrt(text: string): string {
  return text.replace(/\r?\n/g, " ").trim();
}

function formatSrtTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const ms = Math.round((clamped - Math.floor(clamped)) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

export function writeCaptions(script: StickmanScript, dest: string): string | null {
  if (!script.captions) return null;
  let t = 0;
  const lines: string[] = [];
  script.beats.forEach((beat, i) => {
    const start = t;
    const end = t + Math.max(1, beat.durationSec);
    lines.push(String(i + 1));
    lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
    lines.push(escapeSrt(beat.narration || beat.title));
    lines.push("");
    t = end;
  });
  fs.writeFileSync(dest, lines.join("\n"));
  return dest;
}

export function stillToClip(still: string, dest: string, dur: number, aspect: string): void {
  const { w, h } = frameSize(aspect);
  const frames = Math.max(2, Math.round(dur * 30));
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},zoompan=z='min(zoom+0.0008,1.08)':d=${frames}:s=${w}x${h}:fps=30`;
  ffmpeg([
    "-y",
    "-loop",
    "1",
    "-i",
    still,
    "-vf",
    vf,
    "-t",
    String(Math.max(1, dur)),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    dest,
  ]);
}

function normalizeClip(src: string, dest: string, dur: number, aspect: string): void {
  const { w, h } = frameSize(aspect);
  ffmpeg([
    "-y",
    "-i",
    src,
    "-vf",
    `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30`,
    "-t",
    String(Math.max(1, dur)),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    dest,
  ]);
}

export function assembleStickman(opts: {
  root: string;
  script: StickmanScript;
  stills: string[];
  clips?: Array<string | null>;
  voiceover?: string | null;
}): string {
  const work = path.join(opts.root, "assemble");
  fs.mkdirSync(work, { recursive: true });
  const built: string[] = [];

  opts.script.beats.forEach((beat, i) => {
    const dest = path.join(work, `clip-${String(beat.id).padStart(2, "0")}.mp4`);
    const existing = opts.clips?.[i];
    if (existing && fs.existsSync(existing)) {
      normalizeClip(existing, dest, beat.durationSec, opts.script.aspect);
    } else {
      const still = opts.stills[i];
      if (!still || !fs.existsSync(still)) {
        throw new Error(`Falta still del beat ${beat.id}`);
      }
      stillToClip(still, dest, beat.durationSec, opts.script.aspect);
    }
    built.push(dest);
  });

  const listPath = path.join(work, "concat.txt");
  fs.writeFileSync(listPath, built.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"));
  const silent = path.join(work, "silent.mp4");
  ffmpeg(["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", silent]);

  const captions = writeCaptions(opts.script, path.join(opts.root, "captions.srt"));
  const voiced = path.join(work, "voiced.mp4");
  const voice = opts.voiceover && fs.existsSync(opts.voiceover) ? opts.voiceover : null;
  if (voice) {
    ffmpeg([
      "-y",
      "-i",
      silent,
      "-i",
      voice,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      voiced,
    ]);
  } else {
    fs.copyFileSync(silent, voiced);
  }

  const finalPath = path.join(opts.root, "final.mp4");
  if (captions && fs.existsSync(captions)) {
    try {
      ffmpeg(["-y", "-i", voiced, "-vf", `subtitles=${captions.replace(/\\/g, "\\\\").replace(/:/g, "\\:")}`, "-c:a", "copy", finalPath]);
    } catch {
      fs.copyFileSync(voiced, finalPath);
    }
  } else {
    fs.copyFileSync(voiced, finalPath);
  }
  return finalPath;
}
