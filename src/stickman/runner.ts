import * as fs from "node:fs";
import * as path from "node:path";
import { AtlasTTS } from "../providers/tts/atlas.js";
import { createStudioImage, createStudioVideo } from "../studio/visual-provider.js";
import { assembleStickman, concatMotionTakes, extractLastFrame } from "./assemble.js";
import { planMotionTakes } from "./catalog.js";
import { jobDir, readScript, writeScript } from "./store.js";
import type { StickmanJobConfig } from "./types.js";
import { buildContinuousMotionPrompt, renderStills } from "./visuals.js";

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
  const takes = planMotionTakes(video.supportedDurations, wanted);
  const dest = path.join(clipsDir, "continuous.mp4");
  const label = config.visualProvider === "gflow" ? "gflow I2V" : "I2V";
  log(
    `motion: ${takes.length} toma${takes.length === 1 ? "" : "s"} ${label} ${takes.join("+")}s (sin freeze, puente por último frame)`,
  );
  const clips: Array<string | null> = script.beats.map(() => null);
  const generated: string[] = [];
  let sourcePath = firstStill;
  let startSec = 0;
  for (let i = 0; i < takes.length; i++) {
    const clipSeconds = takes[i]!;
    const takePath = path.join(clipsDir, `take-${String(i + 1).padStart(2, "0")}.mp4`);
    try {
      const result = await video.generate({
        sourceImage: fs.readFileSync(sourcePath),
        prompt: buildContinuousMotionPrompt(script, clipSeconds, {
          startSec,
          takeIndex: i,
          takeCount: takes.length,
        }),
        durationSeconds: clipSeconds,
        aspectRatio: script.aspect,
        negativePrompt:
          "photoreal, collage, torn paper, 3D, detailed face, sphere head, jump cut, hard cut",
      });
      fs.copyFileSync(result.filePath, takePath);
      generated.push(takePath);
      log(`take ${i + 1}/${takes.length} ok → ${path.basename(takePath)} (${clipSeconds}s)`);
      if (i < takes.length - 1) {
        sourcePath = extractLastFrame(
          takePath,
          path.join(clipsDir, `bridge-${String(i + 1).padStart(2, "0")}.png`),
        );
      }
      startSec += clipSeconds;
    } catch (err) {
      log(`take ${i + 1}/${takes.length} skipped: ${err}`);
      break;
    }
  }
  if (generated.length) {
    concatMotionTakes(generated, dest, script.aspect);
    const hero = script.beats[0];
    if (hero) hero.clipPath = path.relative(jobDir(id), dest);
    clips[0] = dest;
    log(`clip continuo ok → ${path.basename(dest)} (${generated.length} toma${generated.length === 1 ? "" : "s"})`);
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
