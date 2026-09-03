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

export interface VideoPlaybackInput {
  sourceDurationSeconds?: number;
  sceneDurationSeconds: number;
  visualType: string;
}

export interface VideoPlayback {
  playbackRate: number;
  loop: boolean;
}

/** Fill the scene so I2V clips do not freeze on the last frame before the next still. */
export function resolveVideoPlayback({
  sourceDurationSeconds,
  sceneDurationSeconds,
  visualType,
}: VideoPlaybackInput): VideoPlayback {
  const source = sourceDurationSeconds ?? 0;
  if (!(source > 0) || !(sceneDurationSeconds > 0) || source >= sceneDurationSeconds - 0.12) {
    return { playbackRate: 1, loop: false };
  }
  if (visualType === "ai_video") {
    const playbackRate = Math.max(0.82, source / sceneDurationSeconds);
    const stretched = source / playbackRate;
    return { playbackRate, loop: stretched < sceneDurationSeconds - 0.12 };
  }
  return { playbackRate: 1, loop: true };
}
