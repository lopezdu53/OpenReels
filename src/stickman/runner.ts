import * as fs from "node:fs";
import * as path from "node:path";
import { AtlasTTS } from "../providers/tts/atlas.js";
import { createStudioImage, createStudioVideo } from "../studio/visual-provider.js";
import { assembleStickman, concatMotionTakes, extractLastFrame } from "./assemble.js";
import { planMotionTakes } from "./catalog.js";
import { jobDir, readScript, writeScript } from "./store.js";
import type { StickmanJobConfig, StickmanScript } from "./types.js";
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

const TAKE_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function padTake(n: number): string {
  return String(n).padStart(2, "0");
}

/** Still that covers time t, so a failed last-frame grab can still feed the next I2V. */
export function stillAtSecond(script: StickmanScript, root: string, t: number): string | null {
  let acc = 0;
  for (const beat of script.beats) {
    const dur = Math.max(1, beat.durationSec);
    if (t >= acc && t < acc + dur && beat.stillPath) {
      const full = path.join(root, beat.stillPath);
      if (fs.existsSync(full)) return full;
    }
    acc += dur;
  }
  const last = [...script.beats].reverse().find((beat) => beat.stillPath);
  if (!last?.stillPath) return null;
  const full = path.join(root, last.stillPath);
  return fs.existsSync(full) ? full : null;
}

function bridgeSource(
  opts: {
    script: StickmanScript;
    firstStill: string;
    clipsDir: string;
    log: (line: string) => void;
  },
  takePath: string,
  takeIndex: number,
  nextStartSec: number,
): string {
  const dest = path.join(opts.clipsDir, `bridge-${padTake(takeIndex + 1)}.png`);
  try {
    const frame = extractLastFrame(takePath, dest);
    opts.log(`puente take ${takeIndex + 1} → ${path.basename(dest)}`);
    return frame;
  } catch (err) {
    const fallback =
      stillAtSecond(opts.script, path.dirname(opts.clipsDir), nextStartSec) ?? opts.firstStill;
    opts.log(
      `puente take ${takeIndex + 1} falló (${err}); I2V siguiente con ${path.basename(fallback)}`,
    );
    if (fallback && fallback !== dest && fs.existsSync(fallback)) {
      fs.copyFileSync(fallback, dest);
      return dest;
    }
    return fallback;
  }
}

async function generateOneTake(opts: {
  script: StickmanScript;
  video: ReturnType<typeof createStudioVideo>;
  sourcePath: string;
  takePath: string;
  clipSeconds: number;
  startSec: number;
  takeIndex: number;
  takeCount: number;
  log: (line: string) => void;
  attempts: number;
  retryMs: number;
}): Promise<void> {
  const n = opts.takeIndex + 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      opts.log(
        attempt === 0
          ? `take ${n}/${opts.takeCount} I2V ${opts.clipSeconds}s…`
          : `take ${n}/${opts.takeCount} reintento ${attempt + 1}/${opts.attempts}`,
      );
      const result = await opts.video.generate({
        sourceImage: fs.readFileSync(opts.sourcePath),
        prompt: buildContinuousMotionPrompt(opts.script, opts.clipSeconds, {
          startSec: opts.startSec,
          takeIndex: opts.takeIndex,
          takeCount: opts.takeCount,
        }),
        durationSeconds: opts.clipSeconds,
        aspectRatio: opts.script.aspect,
        negativePrompt:
          "photoreal, collage, torn paper, 3D, detailed face, sphere head, jump cut, hard cut",
      });
      fs.copyFileSync(result.filePath, opts.takePath);
      opts.log(
        `take ${n}/${opts.takeCount} ok → ${path.basename(opts.takePath)} (${opts.clipSeconds}s)`,
      );
      return;
    } catch (err) {
      lastErr = err;
      opts.log(`take ${n}/${opts.takeCount} error: ${err}`);
      if (attempt < opts.attempts - 1) await sleep(opts.retryMs * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`I2V take ${n}/${opts.takeCount} no se generó: ${String(lastErr)}`);
}

export async function generateChainedTakes(opts: {
  script: StickmanScript;
  video: ReturnType<typeof createStudioVideo>;
  firstStill: string;
  clipsDir: string;
  takes: number[];
  log: (line: string) => void;
  retryMs?: number;
  attempts?: number;
}): Promise<string[]> {
  const generated: string[] = [];
  let sourcePath = opts.firstStill;
  let startSec = 0;
  const attempts = Math.max(1, opts.attempts ?? TAKE_ATTEMPTS);
  const retryMs = Math.max(0, opts.retryMs ?? 4000);
  for (const [i, clipSeconds] of opts.takes.entries()) {
    const takePath = path.join(opts.clipsDir, `take-${padTake(i + 1)}.mp4`);
    await generateOneTake({
      script: opts.script,
      video: opts.video,
      sourcePath,
      takePath,
      clipSeconds,
      startSec,
      takeIndex: i,
      takeCount: opts.takes.length,
      log: opts.log,
      attempts,
      retryMs,
    });
    generated.push(takePath);
    if (i < opts.takes.length - 1) {
      sourcePath = bridgeSource(opts, takePath, i, startSec + clipSeconds);
    }
    startSec += clipSeconds;
  }
  return generated;
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
  const wanted = Math.max(
    script.beats.reduce((sum, beat) => sum + Math.max(1, beat.durationSec), 0),
    config.durationSec,
  );
  const takes = planMotionTakes(video.supportedDurations, wanted);
  const dest = path.join(clipsDir, "continuous.mp4");
  const label = config.visualProvider === "gflow" ? "gflow I2V" : "I2V";
  log(
    `motion: ${takes.length} toma${takes.length === 1 ? "" : "s"} ${label} ${takes.join("+")}s (sin freeze, puente por último frame)`,
  );
  const clips: Array<string | null> = script.beats.map(() => null);
  const generated = await generateChainedTakes({
    script,
    video,
    firstStill,
    clipsDir,
    takes,
    log,
  });
  if (generated.length) {
    concatMotionTakes(generated, dest, script.aspect);
    const hero = script.beats[0];
    if (hero) hero.clipPath = path.relative(jobDir(id), dest);
    clips[0] = dest;
    log(
      `clip continuo ok → ${path.basename(dest)} (${generated.length} toma${generated.length === 1 ? "" : "s"})`,
    );
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
