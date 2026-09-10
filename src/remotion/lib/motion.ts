export interface KenBurnsInput {
  progress: number;
  motion: string;
  intensity?: number;
}

export function kenBurnsTransform({ progress, motion, intensity = 1.2 }: KenBurnsInput): {
  scale: number;
  translateX: number;
} {
  const t = Math.min(1, Math.max(0, progress));
  switch (motion) {
    case "zoom_in":
      return { scale: 1 + 0.18 * intensity * t, translateX: 0 };
    case "zoom_out":
      return { scale: 1 + 0.18 * intensity * (1 - t), translateX: 0 };
    case "pan_right":
      return { scale: 1.18, translateX: 55 * intensity * t };
    case "pan_left":
      return { scale: 1.18, translateX: -55 * intensity * t };
    default:
      return { scale: 1 + 0.06 * intensity * t, translateX: 0 };
  }
}

/** Skip the I2V still-echo so the incoming clip does not replay the outgoing last frame. */
export const MATCH_CUT_SKIP_FRAMES = 6;
/** 100ms dissolve hides the decoder hitch when last/first frames already match. */
export const MATCH_CUT_BLEND_FRAMES = 3;

export interface VideoPlaybackInput {
  sourceDurationSeconds?: number;
  sceneDurationSeconds: number;
  visualType: string;
  startFromFrames?: number;
  fps?: number;
  /** Stretch the clip to fill the scene instead of freezing the last frame. */
  fillScene?: boolean;
}

export interface VideoPlayback {
  playbackRate: number;
  loop: boolean;
}

/**
 * Fill the scene. I2V clips never loop — the last frame is the next clip's
 * match-cut seed, so jumping back to t=0 breaks the join.
 */
export function resolveVideoPlayback({
  sourceDurationSeconds,
  sceneDurationSeconds,
  visualType,
  startFromFrames = 0,
  fps = 30,
  fillScene = false,
}: VideoPlaybackInput): VideoPlayback {
  const skipSec = Math.max(0, startFromFrames) / Math.max(1, fps);
  const source = Math.max(0, (sourceDurationSeconds ?? 0) - skipSec);
  if (!(source > 0) || !(sceneDurationSeconds > 0) || source >= sceneDurationSeconds - 0.04) {
    return { playbackRate: 1, loop: false };
  }
  if (visualType === "ai_video") {
    const floor = fillScene ? 0.7 : 0.82;
    const playbackRate = Math.max(floor, source / sceneDurationSeconds);
    return { playbackRate, loop: false };
  }
  return { playbackRate: 1, loop: true };
}
