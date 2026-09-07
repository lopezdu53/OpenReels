import * as fs from "node:fs";
import * as path from "node:path";
import { AtlasTTS } from "../providers/tts/atlas.js";
import { AtlasVideo } from "../providers/video/atlas.js";
import { assembleStickman } from "./assemble.js";
import { jobDir, readScript, writeScript } from "./store.js";
import { renderStills } from "./visuals.js";

export async function runTts(id: string, apiKey: string, ttsModel: string, log: (line: string) => void): Promise<string> {
  const script = readScript(id);
  if (!script) throw new Error("Falta script.json");
  const text = script.beats.map((beat) => beat.narration).filter(Boolean).join(" ");
  if (!text.trim()) throw new Error("El guion no tiene narración");
  log(`TTS ${text.length} caracteres`);
  const tts = new AtlasTTS(script.voice.voice_id, apiKey, script.voice.speed, ttsModel);
  const { audio } = await tts.generate(text);
  const dest = path.join(jobDir(id), "voiceover.wav");
  fs.writeFileSync(dest, audio);
  return dest;
}

export async function runVisuals(id: string, apiKey: string, log: (line: string) => void): Promise<string[]> {
  const script = readScript(id);
  if (!script) throw new Error("Falta script.json");
  const paths = await renderStills(jobDir(id), script, apiKey, log);
  writeScript(id, script);
  return paths;
}

export async function runMotion(id: string, apiKey: string, log: (line: string) => void): Promise<Array<string | null>> {
  const script = readScript(id);
  if (!script) throw new Error("Falta script.json");
  if (!script.animate) {
    log("motion: hold + zoom (sin I2V)");
    return script.beats.map(() => null);
  }
  const clipsDir = path.join(jobDir(id), "clips");
  fs.mkdirSync(clipsDir, { recursive: true });
  const video = new AtlasVideo(script.video_model, apiKey, null);
  const clips: Array<string | null> = [];
  for (const beat of script.beats) {
    const stillRel = beat.stillPath;
    const still = stillRel ? path.join(jobDir(id), stillRel) : "";
    if (!still || !fs.existsSync(still)) {
      clips.push(null);
      continue;
    }
    const dest = path.join(clipsDir, `beat-${String(beat.id).padStart(2, "0")}.mp4`);
    try {
      const result = await video.generate({
        sourceImage: fs.readFileSync(still),
        prompt:
          "Subtle flipbook motion of the same 2D stick figures. Limbs move a little. Same line style. Never morph into photoreal or collage.",
        durationSeconds: Math.min(5, Math.max(3, beat.durationSec)),
        aspectRatio: script.aspect,
        negativePrompt: "photoreal, collage, torn paper, 3D, detailed face, sphere head",
      });
      fs.copyFileSync(result.filePath, dest);
      beat.clipPath = path.relative(jobDir(id), dest);
      clips.push(dest);
      log(`clip ${beat.id} ok`);
    } catch (err) {
      log(`clip ${beat.id} skipped: ${err}`);
      clips.push(null);
    }
  }
  writeScript(id, script);
  return clips;
}

export async function runAssemble(id: string, log: (line: string) => void): Promise<string> {
  const script = readScript(id);
  if (!script) throw new Error("Falta script.json");
  const root = jobDir(id);
  const stills = script.beats.map((beat) => (beat.stillPath ? path.join(root, beat.stillPath) : ""));
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
