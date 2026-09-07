import * as fs from "node:fs";
import * as path from "node:path";
import pLimit from "p-limit";
import type { ArchetypeConfig } from "../../schema/archetype.js";
import type { DirectorScore } from "../../schema/director-score.js";
import type {
  LLMProvider,
  LLMUsage,
  VideoProvider,
} from "../../schema/providers.js";
import type { PipelineCallbacks } from "../../pipeline/utils.js";
import { optimizeImagePrompt } from "../../agents/image-prompter.js";

export interface VideoResolution {
  method: "image_to_video" | "image_fallback";
  provider: string;
  durationSeconds: number | null;
  error?: string;
  imageGenTimeMs: number;
  videoGenTimeMs: number | null;
  motionPrompt?: string;
  negativePrompt?: string;
}

// Module-level concurrency limiter for video gen API calls
const videoGenLimit = pLimit(3);

const DEFAULT_VIDEO_NEGATIVES =
  "blur, low resolution, flickering, compression artifacts, frame drops, jitter, stutter, warping, morphing, unnatural physics, deformed hands, extra fingers, morphing faces, sliding motion";

const HERO_IDENTITY_NEGATIVES =
  "different person, new face, face swap, wardrobe change, new clothes, new glasses, new hairstyle, new room, new location, identity morph, clothing morph";

/** Hero I2V drifts hard after ~5s; hold the last frame in assembly instead of a longer morph. */
export const HERO_I2V_MAX_SECONDS = 5;

export function buildHeroMotionPrompt(opts: {
  scriptLine: string;
  cameraMove?: string;
  continuation: boolean;
}): string {
  const hold = opts.continuation
    ? "SOURCE IMAGE LOCK: this still IS the last frame of the previous clip. Keep the same face, glasses, hair, body, clothes, jewelry, and room. Do not redesign anything. Continue the motion immediately — do not freeze or hold the first frames."
    : "SOURCE IMAGE LOCK: animate this exact still. Keep the same face, glasses, hair, body, clothes, jewelry, and room. Do not invent a new wardrobe or location.";
  const cam =
    opts.cameraMove && opts.cameraMove !== "static"
      ? ` Camera: ${opts.cameraMove} following the body.`
      : "";
  return `${hold} Only the action changes: ${opts.scriptLine.trim()}.${cam} One take. End on a stable pose the next clip can inherit.`;
}

/**
 * Pick the smallest supported duration that is >= the target.
 * If target exceeds all supported durations, pick the max (trim, never loop).
 */
function pickDuration(supportedDurations: number[], targetSeconds: number): number {
  const sorted = [...supportedDurations].sort((a, b) => a - b);
  for (const d of sorted) {
    if (d >= targetSeconds) return d;
  }
  return sorted[sorted.length - 1] ?? 5;
}

/** Largest supported clip that still fits the identity cap. Prefer short over morph. */
export function pickHeroDuration(supportedDurations: number[], maxSeconds: number): number {
  const atOrBelow = supportedDurations.filter((d) => d <= maxSeconds).sort((a, b) => b - a);
  if (atOrBelow[0] != null) return atOrBelow[0];
  const sorted = [...supportedDurations].sort((a, b) => a - b);
  return sorted[0] ?? maxSeconds;
}

export async function resolveAIVideo(
  scene: DirectorScore["scenes"][number],
  imageResult: { path: string; buffer: Buffer; usage: LLMUsage | null; remoteUrl?: string },
  sceneIndex: number,
  assetsDir: string,
  opts: {
    videoProviders: VideoProvider[];
    llm: LLMProvider;
    archetype: ArchetypeConfig;
    callbacks: PipelineCallbacks;
    sceneDurationSeconds?: number;
    totalScenes?: number;
    aspectRatio?: string;
    characterLock?: string;
    locationLock?: string;
    objectLock?: string;
    shotContext?: string;
    heroFollowCam?: boolean;
    continuation?: boolean;
  },
): Promise<{
  path: string;
  usage: LLMUsage | null;
  durationSeconds: number | null;
  videoResolution: VideoResolution;
  prompterUsage?: LLMUsage | null;
}> {
  const imageGenTimeMs = 0; // Already tracked by caller

  // Hero follow-cam: do not let the LLM rewrite a new wardrobe/face. Job 18
  // chained last frames correctly, then I2V invented a different man each clip.
  let motionPrompt = scene.visual_prompt;
  let prompterUsage: LLMUsage | null = null;
  if (opts.heroFollowCam) {
    motionPrompt = buildHeroMotionPrompt({
      scriptLine: scene.script_line,
      cameraMove: scene.camera_move,
      continuation: Boolean(opts.continuation),
    });
  } else {
    try {
      const optimized = await optimizeImagePrompt(
        opts.llm,
        scene.visual_prompt,
        scene.script_line,
        sceneIndex,
        opts.totalScenes ?? 1,
        opts.archetype,
        {
          mode: "video",
          characterLock: opts.characterLock,
          locationLock: opts.locationLock,
          objectLock: opts.objectLock,
          aspectRatio: opts.aspectRatio,
          ...(opts.shotContext ? { shotContext: opts.shotContext } : {}),
        },
      );
      motionPrompt = optimized.prompt;
      prompterUsage = optimized.usage;
    } catch (err) {
      console.warn(`[video] Scene ${sceneIndex} motion prompt gen failed, using visual_prompt: ${err}`);
    }
  }

  opts.callbacks.onProgress?.("visuals", { type: "video_image_ready", scene: sceneIndex });

  // Construct negative prompt: defaults + archetype anti-artifact guidance
  const archetypeGuidance = opts.archetype.antiArtifactGuidance?.trim();
  const identityNegatives = opts.heroFollowCam ? `, ${HERO_IDENTITY_NEGATIVES}` : "";
  const negativePrompt = archetypeGuidance
    ? `${DEFAULT_VIDEO_NEGATIVES}, ${archetypeGuidance}${identityNegatives}`
    : `${DEFAULT_VIDEO_NEGATIVES}${identityNegatives}`;

  // Try each video provider in order
  for (let i = 0; i < opts.videoProviders.length; i++) {
    const provider = opts.videoProviders[i]!;
    const providerName = i === 0 ? "primary" : "secondary";
    const rawTarget = opts.sceneDurationSeconds ?? 5;
    const genDuration = opts.heroFollowCam
      ? pickHeroDuration(provider.supportedDurations, HERO_I2V_MAX_SECONDS)
      : pickDuration(provider.supportedDurations, rawTarget);

    try {
      const videoStart = Date.now();
      const videoResult = await videoGenLimit(() =>
        provider.generate({
          sourceImage: imageResult.buffer,
          prompt: motionPrompt,
          durationSeconds: genDuration,
          aspectRatio: opts.aspectRatio ?? "9:16",
          negativePrompt,
          imageUrl: imageResult.remoteUrl,
        }),
      );
      const videoGenTimeMs = Date.now() - videoStart;

      // Copy video to assets dir and clean up temp file
      const videoPath = path.join(assetsDir, `scene-${sceneIndex}-ai-video.mp4`);

      // Validate before using: moov atom missing means truncated/corrupt download
      const fileSize = fs.statSync(videoResult.filePath).size;
      if (fileSize < 50_000) {
        try { fs.unlinkSync(videoResult.filePath); } catch {}
        throw new Error(`Video file too small (${fileSize} bytes) — likely corrupt or incomplete`);
      }

      fs.copyFileSync(videoResult.filePath, videoPath);
      try {
        fs.unlinkSync(videoResult.filePath);
      } catch {
        // Temp file cleanup is best-effort
      }

      opts.callbacks.onProgress?.("visuals", {
        type: "video_generated",
        scene: sceneIndex,
        durationSeconds: videoResult.durationSeconds,
        provider: providerName,
      });

      return {
        path: videoPath,
        usage: imageResult.usage,
        durationSeconds: videoResult.durationSeconds,
        videoResolution: {
          method: "image_to_video",
          provider: providerName,
          durationSeconds: videoResult.durationSeconds,
          imageGenTimeMs,
          videoGenTimeMs,
          motionPrompt,
          negativePrompt,
        },
        prompterUsage,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(`[video] Scene ${sceneIndex} ${providerName} provider failed: ${errorMsg}`);

      // If this is the last provider, fall through to image fallback
      if (i === opts.videoProviders.length - 1) {
        opts.callbacks.onProgress?.("visuals", {
          type: "video_fallback",
          scene: sceneIndex,
          reason: errorMsg,
        });

        return {
          path: imageResult.path,
          usage: imageResult.usage,
          durationSeconds: null,
          videoResolution: {
            method: "image_fallback",
            provider: "none",
            durationSeconds: null,
            error: errorMsg,
            imageGenTimeMs,
            videoGenTimeMs: null,
          },
          prompterUsage,
        };
      }
      // Otherwise try next provider
    }
  }

  // Should not reach here, but fallback to image just in case
  return {
    path: imageResult.path,
    usage: imageResult.usage,
    durationSeconds: null,
    videoResolution: {
      method: "image_fallback",
      provider: "none",
      durationSeconds: null,
      error: "No video providers available",
      imageGenTimeMs,
      videoGenTimeMs: null,
    },
    prompterUsage,
  };
}
