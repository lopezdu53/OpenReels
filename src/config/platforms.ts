export interface PlatformConfig {
  width: number;
  height: number;
  fps: number;
  maxDurationSeconds: number;
  minDurationSeconds?: number;
  recommendedDurationSeconds: { min: number; max: number };
  codec: "h264" | "h265";
  orientation?: "portrait" | "landscape";
  longForm?: boolean;
}

export const PLATFORMS: Record<string, PlatformConfig> = {
  youtube: {
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 90,
    minDurationSeconds: 84,
    recommendedDurationSeconds: { min: 84, max: 90 },
    codec: "h264",
    orientation: "portrait",
  },
  tiktok: {
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 180,
    minDurationSeconds: 84,
    recommendedDurationSeconds: { min: 84, max: 120 },
    codec: "h264",
    orientation: "portrait",
  },
  instagram: {
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 90,
    minDurationSeconds: 84,
    recommendedDurationSeconds: { min: 84, max: 90 },
    codec: "h264",
    orientation: "portrait",
  },
  reel_extend: {
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 1200,
    minDurationSeconds: 120,
    recommendedDurationSeconds: { min: 120, max: 1200 },
    codec: "h264",
    orientation: "portrait",
    longForm: true,
  },
};

export function getPlatformConfig(platform: string): PlatformConfig {
  const config = PLATFORMS[platform];
  if (!config) {
    throw new Error(
      `Unknown platform: ${platform}. Available: ${Object.keys(PLATFORMS).join(", ")}`,
    );
  }
  return config;
}
