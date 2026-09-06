/**
 * Structured shot context injected into image prompts (waoowaoo asset-prompt-context).
 * Same character bible + named location every shot; only camera and action change.
 */

import { isHeroFollowCam } from "./identity.js";

export function buildShotContext(opts: {
  characterLock?: string;
  locationLock?: string;
  objectLock?: string;
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
  if (opts.locationLock?.trim()) {
    lines.push(`location_bible: ${opts.locationLock.trim()}`);
  }
  if (opts.objectLock?.trim()) {
    lines.push(`object_bible: ${opts.objectLock.trim()}`);
  }
  if (opts.artStyle?.trim()) {
    lines.push(`art_style_lock: ${opts.artStyle.trim()}`);
  }
  if (opts.shotType?.trim()) lines.push(`shot_type: ${opts.shotType.trim()}`);
  if (opts.cameraMove?.trim()) lines.push(`camera_move: ${opts.cameraMove.trim()}`);
  if (opts.location?.trim()) lines.push(`location: ${opts.location.trim()}`);
  if (opts.previousVisualPrompt?.trim()) {
    const last = opts.previousVisualPrompt.trim().slice(0, 400);
    lines.push(
      isHeroFollowCam(opts.characterLock)
        ? `previous_shot: inherit the last pose, facing, stride, and object in hand. Continue as the next beat of ONE take — camera tracks the body; the world scrolls or transforms around them. Do not start a new portrait. Last frame: ${last}`
        : `previous_shot (keep the world; follow ON SCREEN for who appears and ON LOCATION for the place — do not carry off-screen CAST or a second roster location from the previous frame): ${last}`,
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
