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
    maxDurationSeconds: 60,
    recommendedDurationSeconds: { min: 40, max: 55 },
    codec: "h264",
    orientation: "portrait",
  },
  tiktok: {
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 180,
    recommendedDurationSeconds: { min: 40, max: 60 },
    codec: "h264",
    orientation: "portrait",
  },
  instagram: {
    width: 1080,
    height: 1920,
    fps: 30,
    maxDurationSeconds: 90,
    recommendedDurationSeconds: { min: 40, max: 55 },
    codec: "h264",
    orientation: "portrait",
  },
  youtube_horizontal: {
    width: 1920,
    height: 1080,
    fps: 30,
    maxDurationSeconds: 2400,
    minDurationSeconds: 900,
    recommendedDurationSeconds: { min: 900, max: 2400 },
    codec: "h264",
    orientation: "landscape",
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
