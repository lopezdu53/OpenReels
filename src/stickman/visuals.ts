import * as fs from "node:fs";
import * as path from "node:path";
import type { ImageProvider } from "../schema/providers.js";
import { lookPrompt, STICKMAN_STYLE_LOCK } from "./catalog.js";

export { planMotionTakes } from "./catalog.js";

import type { StickmanBeat, StickmanScript } from "./types.js";

function isTransient(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("timed out") ||
    msg.includes("timeout") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("rate_limit") ||
    msg.includes("overloaded") ||
    msg.includes("econnreset") ||
    msg.includes("fetch failed") ||
    msg.includes("too small") ||
    msg.includes("no output url")
  );
}

export function castLock(script: StickmanScript): string {
  return script.bible.cast
    .map((member) => {
      const acc =
        member.accessory && member.accessory !== "none" ? `, accessory ${member.accessory}` : "";
      return `${member.name} (${member.role}): ${member.head} head, ${member.lineColor} single-stroke limbs${acc}`;
    })
    .join(". ");
}

export function totalBeatSeconds(script: StickmanScript): number {
  return script.beats.reduce((sum, beat) => sum + Math.max(1, beat.durationSec), 0);
}

export function pickMotionDuration(supported: number[], wanted: number): number {
  const target = Math.max(4, Math.round(wanted));
  if (!supported.length) return Math.min(15, target);
  if (supported.includes(target)) return target;
  const fit = [...supported].sort((a, b) => a - b).find((d) => d >= target);
  return fit ?? supported[supported.length - 1] ?? 8;
}

export function buildStillPrompt(script: StickmanScript, beat: StickmanBeat): string {
  return [
    `2D stickman still, look: ${lookPrompt(script.look)}.`,
    `Locked cast: ${castLock(script)}.`,
    `World: ${script.bible.world}.`,
    `Beat ${beat.id} "${beat.title}": ${beat.pose}.`,
    `Backdrop: ${beat.scene}.`,
    "Same stick figures as the previous still if any. Same line weight. Same wardrobe.",
    STICKMAN_STYLE_LOCK,
  ].join(" ");
}

/** One Omni-Flash-style take: timed morphs inside a clip. Longer jobs chain takes from the last frame. */
export function buildContinuousMotionPrompt(
  script: StickmanScript,
  clipSeconds: number,
  window?: { startSec: number; takeIndex: number; takeCount: number },
): string {
  const startSec = window?.startSec ?? 0;
  const takeIndex = window?.takeIndex ?? 0;
  const takeCount = window?.takeCount ?? 1;
  const windowEnd = startSec + clipSeconds;
  let t = 0;
  const timed = script.beats
    .map((beat) => {
      const beatStart = t;
      const beatEnd = t + Math.max(1, beat.durationSec);
      t = beatEnd;
      const overlapStart = Math.max(beatStart, startSec);
      const overlapEnd = Math.min(beatEnd, windowEnd);
      if (overlapEnd <= overlapStart) return null;
      const a = (overlapStart - startSec).toFixed(1);
      const b = (overlapEnd - startSec).toFixed(1);
      return `[${a}–${b}s] ${beat.title}: ${beat.pose}. Environment morphs to: ${beat.scene}.`;
    })
    .filter((line): line is string => Boolean(line));
  const bridge =
    takeIndex > 0
      ? "CONTINUE from the exact pose, camera, and line-art in the source image (last frame of the previous 10s Omni take). The first frame IS that image. Start moving immediately — do not hold a still. Then keep morphing. NO cut, NO new shot, NO reset."
      : script.contentHook && takeIndex === 0
        ? "CONTENT HOOK TAKE: this first 10s is a trailer of the FULL video. Rapid in-shot teases of later poses, then morph into the real opening. Do not deliver the punchline yet."
        : "Start from the source still and begin moving immediately.";
  return [
    `ONE CONTINUOUS ${clipSeconds}s 2D stickman take (${takeIndex + 1}/${takeCount}). NO CUTS. NO jump cuts. NO edited scene wipes.`,
    bridge,
    "The camera and the line-art world morph in-shot every 2–3 seconds, like a single Gemini Omni Flash clip.",
    `Look: ${lookPrompt(script.look)}.`,
    `Locked cast: ${castLock(script)}.`,
    `World: ${script.bible.world}.`,
    ...timed,
    "Same stick figures, line weight, and wardrobe for the whole take.",
    "Limbs move. Oversized props and line-art architecture may grow, shatter, or morph.",
    STICKMAN_STYLE_LOCK,
  ].join(" ");
}

export async function renderStills(
  root: string,
  script: StickmanScript,
  image: ImageProvider,
  log: (line: string) => void,
): Promise<string[]> {
  const dir = path.join(root, "stills");
  fs.mkdirSync(dir, { recursive: true });
  const paths: string[] = [];
  let previous: Buffer | undefined;

  for (const beat of script.beats) {
    const dest = path.join(dir, `beat-${String(beat.id).padStart(2, "0")}.png`);
    if (fs.existsSync(dest) && fs.statSync(dest).size >= 1000) {
      previous = fs.readFileSync(dest);
      beat.stillPath = path.relative(root, dest);
      paths.push(dest);
      log(`still ${beat.id}/${script.beats.length} ya existe → ${path.basename(dest)}`);
      continue;
    }
    const prompt = buildStillPrompt(script, beat);
    let buf: Buffer | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        buf = await image.generate(prompt, STICKMAN_STYLE_LOCK, previous, script.aspect);
        if (buf.length < 1000) throw new Error(`still too small (${buf.length})`);
        break;
      } catch (err) {
        lastError = err;
        if (!isTransient(err) || attempt === 2) break;
        const delay = 2000 * 2 ** attempt;
        log(`beat ${beat.id} still retry ${attempt + 1}: ${err}`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    if (!buf) {
      if (previous) {
        log(`beat ${beat.id} failed (${lastError}); holding previous stickman still`);
        buf = previous;
      } else {
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      }
    }
    fs.writeFileSync(dest, buf);
    previous = buf;
    beat.stillPath = path.relative(root, dest);
    paths.push(dest);
    log(`still ${beat.id}/${script.beats.length} → ${path.basename(dest)}`);
  }
  return paths;
}
