import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { WordTimestamp } from "../schema/providers.js";

/** Slice the full voiceover to one scene's word window. */
export function sliceSceneAudio(voiceoverPath: string, words?: WordTimestamp[]): Buffer | undefined {
  if (!voiceoverPath || !words?.length) return undefined;
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return undefined;
  const start = Math.max(0, first.start);
  const duration = Math.max(0.4, last.end - first.start + 0.15);
  const dest = path.join(os.tmpdir(), `openreels-scene-vo-${Date.now()}.wav`);
  try {
    execFileSync(
      "ffmpeg",
      ["-y", "-ss", String(start), "-t", String(duration), "-i", voiceoverPath, "-acodec", "pcm_s16le", "-ar", "16000", dest],
      { stdio: "pipe" },
    );
    const buf = fs.readFileSync(dest);
    return buf.length > 32 ? buf : undefined;
  } catch {
    return undefined;
  } finally {
    try {
      fs.unlinkSync(dest);
    } catch {
      /* ignore */
    }
  }
}
