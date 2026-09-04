/**
 * Structured shot context injected into image prompts (waoowaoo asset-prompt-context).
 * Same character bible + named location every shot; only camera and action change.
 */

export function buildShotContext(opts: {
  characterLock?: string;
  artStyle?: string;
  shotType?: string;
  cameraMove?: string;
  location?: string;
  previousVisualPrompt?: string;
}): string {
  const lines: string[] = [];
  if (opts.characterLock?.trim()) {
    lines.push(`character_bible: ${opts.characterLock.trim()}`);
  }
  if (opts.artStyle?.trim()) {
    lines.push(`art_style_lock: ${opts.artStyle.trim()}`);
  }
  if (opts.shotType?.trim()) lines.push(`shot_type: ${opts.shotType.trim()}`);
  if (opts.cameraMove?.trim()) lines.push(`camera_move: ${opts.cameraMove.trim()}`);
  if (opts.location?.trim()) lines.push(`location: ${opts.location.trim()}`);
  if (opts.previousVisualPrompt?.trim()) {
    lines.push(
      `previous_shot (keep the world and location; follow ON SCREEN for who appears — do not carry off-screen CAST members from the previous frame): ${opts.previousVisualPrompt.trim().slice(0, 400)}`,
    );
  }
  return lines.join("\n");
}

export const FILM_SHOT_TYPES = [
  "wide_establishing",
  "wide",
  "medium",
  "close_up",
  "extreme_close_up",
  "over_shoulder",
  "aerial",
  "insert",
] as const;

export const FILM_CAMERA_MOVES = ["static", "push_in", "pull_out", "pan", "track"] as const;
