import * as fs from "node:fs";
import * as path from "node:path";
import { AtlasImage } from "../providers/image/atlas.js";
import { STICKMAN_STYLE_LOCK, lookPrompt } from "./catalog.js";
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
      const acc = member.accessory && member.accessory !== "none" ? `, accessory ${member.accessory}` : "";
      return `${member.name} (${member.role}): ${member.head} head, ${member.lineColor} single-stroke limbs${acc}`;
    })
    .join(". ");
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

export async function renderStills(
  root: string,
  script: StickmanScript,
  apiKey: string,
  log: (line: string) => void,
): Promise<string[]> {
  const dir = path.join(root, "stills");
  fs.mkdirSync(dir, { recursive: true });
  const image = new AtlasImage(script.image_model, apiKey);
  const paths: string[] = [];
  let previous: Buffer | undefined;

  for (const beat of script.beats) {
    const dest = path.join(dir, `beat-${String(beat.id).padStart(2, "0")}.png`);
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
