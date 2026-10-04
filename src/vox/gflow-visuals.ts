import * as fs from "node:fs";
import * as path from "node:path";
import {
  DEFAULT_GFLOW_IMAGE_MODEL,
  DEFAULT_GFLOW_VIDEO_MODE,
  DEFAULT_GFLOW_VIDEO_MODEL,
} from "../providers/gflow/catalog.js";
import { GflowImage } from "../providers/image/gflow.js";
import { GflowVideo } from "../providers/video/gflow.js";
import { jobDir, readBeats, writeBeats } from "./store.js";
import type { VoxBeat, VoxJobConfig, VoxShot } from "./types.js";

function shotsOf(beat: VoxBeat): Array<{ shot: VoxShot; key: string }> {
  if (beat.shots?.length) {
    return beat.shots.map((shot) => ({ shot, key: `${beat.id}${shot.id ?? ""}` }));
  }
  return [{ shot: beat as unknown as VoxShot, key: String(beat.id) }];
}

export function collageStillPrompt(opts: {
  scene: string;
  titleEn?: string;
  titleCn?: string;
  bg?: string;
  theme: string;
  aspect: string;
  withTitle?: boolean;
}): string {
  const headline = opts.titleEn || opts.titleCn || "";
  return [
    `Mixed-media paper-collage poster, ${opts.theme} editorial look.`,
    opts.scene,
    opts.withTitle === false ? "No large headline type." : `Bold headline space: ${headline}.`,
    `Background ${opts.bg || "warm ochre"}. Torn paper, tape, halftone, newsprint.`,
    `Aspect ${opts.aspect}. Flat 2D cut-outs, not photoreal, no watermarks.`,
  ].join(" ");
}

export function collageMotionPrompt(shot: VoxShot, beat: VoxBeat, freeze?: string): string {
  return [
    "Animate this paper-collage still into a motion graphic. Printed cut-outs, not photoreal.",
    `CAMERA (one move only): ${shot.camera_move}.`,
    `ELEMENT MOTION: ${shot.element_motion}.`,
    freeze ? freeze : "",
    `FEEL: ${beat.feel}. Keep headline lettering sharp. Flat 2D, one continuous move, no morph.`,
  ]
    .filter(Boolean)
    .join(" ");
}

function imageOf(config: VoxJobConfig): GflowImage {
  return new GflowImage(config.gflowImageModel || DEFAULT_GFLOW_IMAGE_MODEL);
}

function videoOf(config: VoxJobConfig): GflowVideo {
  return new GflowVideo(
    config.gflowVideoModel || DEFAULT_GFLOW_VIDEO_MODEL,
    config.gflowVideoMode || DEFAULT_GFLOW_VIDEO_MODE,
  );
}

async function writePng(dest: string, buf: Buffer): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
}

export async function runGflowBakeoff(
  id: string,
  themes: string[],
  config: VoxJobConfig,
  log: (line: string) => void,
): Promise<void> {
  const beats = readBeats(id);
  if (!beats?.beats?.[0]) throw new Error("Falta beats.json");
  const first = beats.beats[0];
  if (!first) throw new Error("Falta beats.json");
  const beat = first;
  const shot = shotsOf(beat)[0]?.shot;
  if (!shot) throw new Error("Falta el primer shot");
  const image = imageOf(config);
  const out = path.join(jobDir(id), "style-bakeoff");
  fs.mkdirSync(out, { recursive: true });
  for (const theme of themes) {
    const prompt = collageStillPrompt({
      scene: shot.scene,
      titleEn: beat.title_en,
      titleCn: beat.title_cn,
      bg: beat.bg,
      theme,
      aspect: beats.aspect,
    });
    log(`bake-off gflow ${theme}`);
    const buf = await image.generate(prompt, undefined, undefined, beats.aspect);
    await writePng(path.join(out, `${theme}.png`), buf);
  }
}

export async function runGflowKeyframes(
  id: string,
  config: VoxJobConfig,
  log: (line: string) => void,
): Promise<void> {
  const beats = readBeats(id);
  if (!beats) throw new Error("Falta beats.json");
  const image = imageOf(config);
  const kfDir = path.join(jobDir(id), "keyframes");
  fs.mkdirSync(kfDir, { recursive: true });
  const theme = beats.theme || beats.collage_style || "american-retro";
  let previous: Buffer | undefined;
  for (const beat of beats.beats) {
    for (const { shot, key } of shotsOf(beat)) {
      if (shot.keyframe_path && fs.existsSync(shot.keyframe_path)) continue;
      const dest = path.join(kfDir, `kf_${key}.png`);
      const prompt = collageStillPrompt({
        scene: shot.scene,
        titleEn: beat.title_en,
        titleCn: beat.title_cn,
        bg: beat.bg,
        theme,
        aspect: beats.aspect,
        withTitle: shot.title !== false,
      });
      log(`keyframe gflow ${key}`);
      const buf = await image.generate(prompt, undefined, previous, beats.aspect);
      await writePng(dest, buf);
      shot.keyframe_path = dest;
      previous = buf;
    }
  }
  writeBeats(id, beats);
}

export async function runGflowCrollKeyframes(
  id: string,
  config: VoxJobConfig,
  log: (line: string) => void,
): Promise<void> {
  const beats = readBeats(id);
  if (!beats) throw new Error("Falta beats.json");
  const photo = beats.anchor_photo;
  if (!photo || !fs.existsSync(photo)) throw new Error("C-roll gflow necesita la foto ancla");
  const ref = fs.readFileSync(photo);
  const image = imageOf(config);
  const kfDir = path.join(jobDir(id), "keyframes");
  fs.mkdirSync(kfDir, { recursive: true });
  const theme = beats.theme || beats.collage_style || "newsprint-editorial";
  const kind = beats.croll_subject === "product" ? "product" : "portrait";
  beats.anchor_freeze =
    kind === "product"
      ? "FREEZE the photographic subject sticker and its label."
      : "FREEZE the photographic face sticker — frozen layer, do not redraw the face.";
  for (const beat of beats.beats) {
    for (const { shot, key } of shotsOf(beat)) {
      if (shot.keyframe_path && fs.existsSync(shot.keyframe_path)) continue;
      const dest = path.join(kfDir, `kf_${key}.png`);
      const prompt = [
        kind === "product"
          ? `${beats.subject_desc || "The product"} from the attached photo is a photographic sticker. Keep label typography.`
          : "The person's face from the attached photo is a photographic sticker. Do not redraw the face.",
        collageStillPrompt({
          scene: shot.scene,
          bg: beat.bg,
          theme,
          aspect: beats.aspect,
          withTitle: false,
        }),
        "Halftone only on the background.",
      ].join(" ");
      log(`c-roll keyframe gflow ${key}`);
      const buf = await image.generate(prompt, undefined, ref, beats.aspect);
      await writePng(dest, buf);
      shot.keyframe_path = dest;
    }
  }
  writeBeats(id, beats);
}

export async function runGflowClips(
  id: string,
  config: VoxJobConfig,
  log: (line: string) => void,
): Promise<void> {
  const beats = readBeats(id);
  if (!beats) throw new Error("Falta beats.json");
  const video = videoOf(config);
  const clipDir = path.join(jobDir(id), "clips");
  fs.mkdirSync(clipDir, { recursive: true });
  for (const beat of beats.beats) {
    for (const { shot, key } of shotsOf(beat)) {
      const still = shot.keyframe_path;
      if (!still || !fs.existsSync(still)) {
        log(`[${key}] sin keyframe — salto clip`);
        continue;
      }
      const dest = path.join(clipDir, `clip_${key}.mp4`);
      try {
        log(`clip gflow ${key} (I2V 8s, en serie)`);
        const result = await video.generate({
          sourceImage: fs.readFileSync(still),
          prompt: collageMotionPrompt(shot, beat, beats.anchor_freeze),
          durationSeconds: Math.min(8, Math.max(4, shot.dur || 6)),
          aspectRatio: beats.aspect,
        });
        fs.copyFileSync(result.filePath, dest);
        shot.clip_path = dest;
        log(`clip ${key} ok`);
      } catch (err) {
        log(`clip ${key} skipped: ${err}`);
      }
    }
  }
  writeBeats(id, beats);
}
