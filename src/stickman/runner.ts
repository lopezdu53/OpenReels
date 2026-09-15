import * as fs from "node:fs";
import * as path from "node:path";
import { AtlasTTS } from "../providers/tts/atlas.js";
import { createStudioImage, createStudioVideo } from "../studio/visual-provider.js";
import { assembleStickman } from "./assemble.js";
import { jobDir, readScript, writeScript } from "./store.js";
import type { StickmanJobConfig } from "./types.js";
import { buildContinuousMotionPrompt, pickMotionDuration, renderStills } from "./visuals.js";

export async function runTts(
  id: string,
  apiKey: string,
  ttsModel: string,
  log: (line: string) => void,
): Promise<string> {
  const script = readScript(id);
  if (!script) throw new Error("Falta script.json");
  const text = script.beats
    .map((beat) => beat.narration)
    .filter(Boolean)
    .join(" ");
  if (!text.trim()) throw new Error("El guion no tiene narración");
  log(`TTS ${text.length} caracteres`);
  const tts = new AtlasTTS(script.voice.voice_id, apiKey, script.voice.speed, ttsModel);
  const { audio } = await tts.generate(text);
  const dest = path.join(jobDir(id), "voiceover.wav");
  fs.writeFileSync(dest, audio);
  return dest;
}

export async function runVisuals(
  id: string,
  config: StickmanJobConfig,
  apiKey: string,
  log: (line: string) => void,
): Promise<string[]> {
  const script = readScript(id);
  if (!script) throw new Error("Falta script.json");
  const image = createStudioImage({
    visualProvider: config.visualProvider,
    atlasModel: script.image_model,
    atlasKey: apiKey,
    gflowModel: config.gflowImageModel,
  });
  const paths = await renderStills(jobDir(id), script, image, log);
  writeScript(id, script);
  return paths;
}

export async function runMotion(
  id: string,
  config: StickmanJobConfig,
  apiKey: string,
  log: (line: string) => void,
): Promise<Array<string | null>> {
  const script = readScript(id);
  if (!script) throw new Error("Falta script.json");
  if (!script.animate) {
    log("motion: hold + zoom (sin I2V)");
    return script.beats.map(() => null);
  }
  const clipsDir = path.join(jobDir(id), "clips");
  fs.mkdirSync(clipsDir, { recursive: true });
  const video = createStudioVideo({
    visualProvider: config.visualProvider,
    atlasModel: script.video_model,
    atlasKey: apiKey,
    gflowModel: config.gflowVideoModel,
    gflowMode: config.gflowVideoMode,
  });
  const firstStillRel = script.beats.find((beat) => beat.stillPath)?.stillPath;
  const firstStill = firstStillRel ? path.join(jobDir(id), firstStillRel) : "";
  if (!firstStill || !fs.existsSync(firstStill)) {
    log("motion: sin still inicial, no hay I2V");
    return script.beats.map(() => null);
  }
  const wanted = script.beats.reduce((sum, beat) => sum + Math.max(1, beat.durationSec), 0);
  const clipSeconds = pickMotionDuration(video.supportedDurations, wanted);
  const dest = path.join(clipsDir, "continuous.mp4");
  if (config.visualProvider === "gflow") {
    log(`motion: un plano gflow I2V continuo (~${clipSeconds}s, sin cortes)`);
  } else {
    log(`motion: un plano I2V continuo (${clipSeconds}s, sin cortes)`);
  }
  const clips: Array<string | null> = script.beats.map(() => null);
  try {
    const result = await video.generate({
      sourceImage: fs.readFileSync(firstStill),
      prompt: buildContinuousMotionPrompt(script, clipSeconds),
      durationSeconds: clipSeconds,
      aspectRatio: script.aspect,
      negativePrompt:
        "photoreal, collage, torn paper, 3D, detailed face, sphere head, jump cut, hard cut",
    });
    fs.copyFileSync(result.filePath, dest);
    const hero = script.beats[0];
    if (hero) hero.clipPath = path.relative(jobDir(id), dest);
    clips[0] = dest;
    log(`clip continuo ok → ${path.basename(dest)}`);
  } catch (err) {
    log(`clip continuo skipped: ${err}`);
  }
  writeScript(id, script);
  return clips;
}

export async function runAssemble(id: string, log: (line: string) => void): Promise<string> {
  const script = readScript(id);
  if (!script) throw new Error("Falta script.json");
  const root = jobDir(id);
  const stills = script.beats.map((beat) =>
    beat.stillPath ? path.join(root, beat.stillPath) : "",
  );
  const clips = script.beats.map((beat) => (beat.clipPath ? path.join(root, beat.clipPath) : null));
  const voice = path.join(root, "voiceover.wav");
  const finalPath = assembleStickman({
    root,
    script,
    stills,
    clips,
    voiceover: fs.existsSync(voice) ? voice : null,
  });
  log(`final → ${finalPath}`);
  return finalPath;
}
