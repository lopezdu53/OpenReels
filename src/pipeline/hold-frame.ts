import * as fs from "node:fs";
import * as path from "node:path";

export function isTransientVisualError(err: unknown): boolean {
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

/** Keep the previous still so a failed beat does not punch a hole in the film. */
export function writeHeldStill(assetsDir: string, sceneIndex: number, previous: Buffer): string {
  const filePath = path.join(assetsDir, `scene-${sceneIndex}-ai.png`);
  fs.writeFileSync(filePath, previous);
  return filePath;
}
