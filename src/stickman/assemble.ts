import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { MP4_FASTSTART_ARGS, remuxMp4Faststart } from "../media/mp4-faststart.js";
import {
  frameSize,
  STICKMAN_FLOW_BED_VOLUME,
  STICKMAN_TAKE_XFADE_SEC,
  STICKMAN_VO_HEAD_SEC,
  stickmanSpokenWindow,
} from "./catalog.js";
import type { StickmanScript } from "./types.js";
import { totalBeatSeconds } from "./visuals.js";

/** If I2V produced a single take, assemble that — never concat beat clips (hard cuts). */
export function singleMotionClip(clips?: Array<string | null>): string | null {
  const found = (clips ?? []).filter((clip): clip is string => Boolean(clip));
  return found.length === 1 ? (found[0] ?? null) : null;
}

function ffmpeg(args: string[]): void {
  execFileSync("ffmpeg", args, { stdio: "pipe" });
}

function writeMp4(dest: string, args: string[]): void {
  ffmpeg([...args, ...MP4_FASTSTART_ARGS, dest]);
}

function copyMp4(src: string, dest: string): void {
  try {
    remuxMp4Faststart(src, dest);
  } catch {
    fs.copyFileSync(src, dest);
  }
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
  writeMp4(dest, [
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
  ]);
}

function normalizeClip(src: string, dest: string, dur: number, aspect: string): void {
  const { w, h } = frameSize(aspect);
  writeMp4(dest, [
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
  ]);
}

function probeSeconds(src: string): number {
  try {
    const out = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src],
      { encoding: "utf8" },
    );
    const n = Number(out.trim());
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function framePngOk(dest: string): boolean {
  return fs.existsSync(dest) && fs.statSync(dest).size > 80;
}

function tryFfmpeg(args: string[]): boolean {
  try {
    execFileSync("ffmpeg", args, { stdio: "pipe", maxBuffer: 8 * 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

/** Last frame of a take so the next Omni I2V can continue. Flow mp4s often lack a seek index. */
export function extractLastFrame(src: string, dest: string): string {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const common = ["-hide_banner", "-loglevel", "error", "-y"];
  const out = ["-map", "0:v:0", "-frames:v", "1", "-update", "1", dest];
  const dur = probeSeconds(src);
  const ss = Math.max(0, dur > 0 ? dur - 0.1 : 0);
  const attempts = [
    [...common, "-sseof", "-0.1", "-i", src, ...out],
    [...common, "-ss", ss.toFixed(3), "-i", src, ...out],
    [...common, "-i", src, "-map", "0:v:0", "-update", "1", dest],
  ];
  for (const args of attempts) {
    if (tryFfmpeg(args) && framePngOk(dest)) return dest;
  }
  throw new Error("No se pudo extraer el último frame del take");
}

function hasAudio(src: string): boolean {
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v",
        "error",
        "-select_streams",
        "a",
        "-show_entries",
        "stream=codec_type",
        "-of",
        "csv=p=0",
        src,
      ],
      { encoding: "utf8" },
    );
    return out.toLowerCase().includes("audio");
  } catch {
    return false;
  }
}

function normalizeTake(src: string, dest: string, aspect: string, trimHead: number): void {
  const { w, h } = frameSize(aspect);
  const vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30`;
  const ss = trimHead > 0.02 ? ["-ss", trimHead.toFixed(3)] : [];
  if (hasAudio(src)) {
    writeMp4(dest, [
      "-y",
      ...ss,
      "-i",
      src,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
    ]);
    return;
  }
  writeMp4(dest, [
    "-y",
    ...ss,
    "-i",
    src,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-vf",
    vf,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
  ]);
}

function xfadePair(a: string, b: string, dest: string, xfade: number): void {
  const offset = Math.max(0.05, probeSeconds(a) - xfade);
  writeMp4(dest, [
    "-y",
    "-i",
    a,
    "-i",
    b,
    "-filter_complex",
    `[0:v][1:v]xfade=transition=fade:duration=${xfade}:offset=${offset.toFixed(3)}[v];[0:a][1:a]acrossfade=d=${xfade}[a]`,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-ac",
    "2",
  ]);
}

export function concatMotionTakes(srcs: string[], dest: string, aspect: string): void {
  if (!srcs.length) throw new Error("No hay takes para concatenar");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const work = path.dirname(dest);
  const xfade = STICKMAN_TAKE_XFADE_SEC;
  const norms = srcs.map((src, i) => {
    const out = path.join(work, `take-norm-${String(i + 1).padStart(2, "0")}.mp4`);
    normalizeTake(src, out, aspect, i > 0 ? 0.08 : 0);
    return out;
  });
  const first = norms[0];
  if (norms.length === 1 && first) {
    copyMp4(first, dest);
    return;
  }
  let acc = first ?? "";
  for (let i = 1; i < norms.length; i++) {
    const next = norms[i];
    if (!acc || !next) continue;
    const out =
      i === norms.length - 1 ? dest : path.join(work, `xfade-${String(i).padStart(2, "0")}.mp4`);
    xfadePair(acc, next, out, xfade);
    acc = out;
  }
}

/** Chain atempo (each step must stay in 0.5–2.0). */
export function atempoChain(ratio: number): string {
  const parts: string[] = [];
  let r = ratio;
  while (r > 2 + 1e-4) {
    parts.push("atempo=2.0");
    r /= 2;
  }
  while (r < 0.5 - 1e-4) {
    parts.push("atempo=0.5");
    r /= 0.5;
  }
  if (Math.abs(r - 1) > 0.01) parts.push(`atempo=${r.toFixed(4)}`);
  return parts.join(",");
}

/** Delay 0.3s, never speak in the last 0.5s (speed up if the VO overruns). */
export function voiceoverFitFilter(voSec: number, videoSec: number): string {
  const window = stickmanSpokenWindow(videoSec);
  const delayMs = Math.round(STICKMAN_VO_HEAD_SEC * 1000);
  const tempo = voSec > window + 0.04 ? voSec / window : 1;
  const parts = [
    "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo",
    atempoChain(tempo),
    `adelay=${delayMs}|${delayMs}`,
    `apad=whole_dur=${videoSec.toFixed(3)}`,
    `atrim=0:${videoSec.toFixed(3)}`,
    "aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo",
  ].filter(Boolean);
  return parts.join(",");
}

export function mixStickmanAudio(
  video: string,
  voiceover: string | null,
  dest: string,
  bedVolume = STICKMAN_FLOW_BED_VOLUME,
): void {
  const vidDur = Math.max(0.5, probeSeconds(video));
  if (!voiceover) {
    copyMp4(video, dest);
    return;
  }
  const voFilter = voiceoverFitFilter(probeSeconds(voiceover) || vidDur, vidDur);
  if (hasAudio(video)) {
    writeMp4(dest, [
      "-y",
      "-i",
      video,
      "-i",
      voiceover,
      "-filter_complex",
      `[0:a]volume=${bedVolume},aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[bed];[1:a]${voFilter}[vo];[bed][vo]amix=inputs=2:duration=first:dropout_transition=2[a]`,
      "-map",
      "0:v:0",
      "-map",
      "[a]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-t",
      vidDur.toFixed(3),
    ]);
    return;
  }
  writeMp4(dest, [
    "-y",
    "-i",
    video,
    "-i",
    voiceover,
    "-filter_complex",
    `[1:a]${voFilter}[vo]`,
    "-map",
    "0:v:0",
    "-map",
    "[vo]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-t",
    vidDur.toFixed(3),
  ]);
}

function fitContinuousClip(src: string, dest: string, dur: number, aspect: string): void {
  const { w, h } = frameSize(aspect);
  const hold = Math.max(1, dur);
  const srcDur = probeSeconds(src);
  const pad = Math.max(0, hold - srcDur);
  const vf =
    pad > 0.4
      ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30,tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}`
      : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},fps=30`;
  const args = [
    "-y",
    "-i",
    src,
    "-vf",
    vf,
    "-t",
    String(hold),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
  ];
  if (hasAudio(src)) {
    args.push("-c:a", "aac", "-ar", "48000", "-ac", "2", "-af", "apad");
  } else {
    args.push("-an");
  }
  writeMp4(dest, args);
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
  const continuous = singleMotionClip(opts.clips);
  const continuousPath = continuous && fs.existsSync(continuous) ? continuous : null;

  if (continuousPath) {
    const dest = path.join(work, "clip-continuous.mp4");
    fitContinuousClip(continuousPath, dest, totalBeatSeconds(opts.script), opts.script.aspect);
    built.push(dest);
  } else {
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
  }

  const listPath = path.join(work, "concat.txt");
  fs.writeFileSync(
    listPath,
    built.map((file) => `file '${file.replace(/'/g, "'\\''")}'`).join("\n"),
  );
  const silent = path.join(work, "silent.mp4");
  writeMp4(silent, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy"]);

  const captions = writeCaptions(opts.script, path.join(opts.root, "captions.srt"));
  const voiced = path.join(work, "voiced.mp4");
  const voice = opts.voiceover && fs.existsSync(opts.voiceover) ? opts.voiceover : null;
  mixStickmanAudio(silent, voice, voiced);

  const finalPath = path.join(opts.root, "final.mp4");
  if (captions && fs.existsSync(captions)) {
    try {
      writeMp4(finalPath, [
        "-y",
        "-i",
        voiced,
        "-vf",
        `subtitles=${captions.replace(/\\/g, "\\\\").replace(/:/g, "\\:")}`,
        "-c:a",
        "copy",
      ]);
    } catch {
      copyMp4(voiced, finalPath);
    }
  } else {
    copyMp4(voiced, finalPath);
  }
  return finalPath;
}
