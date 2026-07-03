import { getArchetype } from "../../config/archetype-registry.js";
import type { ArchetypeConfig } from "../../schema/archetype";
import type { DirectorScore, TransitionType } from "../../schema/director-score";
import type { WordTimestamp } from "../../schema/providers";

export interface SceneProps {
  visualType: string;
  assetSrc: string | null;
  motion: string;
  visualPrompt: string;
  scriptLine: string;
  durationInFrames: number;
  words: WordTimestamp[];
  colorPalette?: ArchetypeConfig["colorPalette"];
  textCardFont?: string;
  motionIntensity?: number;
  startFrom?: number;
  sourceDurationInSeconds?: number;
  transition: TransitionType;
  transitionDurationFrames: number;
}

export interface CompositionProps {
  scenes: SceneProps[];
  captionStyle: string;
  voiceoverSrc: string | null;
  musicSrc: string | null;
  // Absolute word timestamps for the entire voiceover (timeline-centric captions + music ducking)
  allWords: WordTimestamp[];
  // Caption theming from archetype
  captionAccentColor: string;
  captionChunkSize: number;
  captionLingerS: number;
  // When true, CaptionWrapper is not rendered (but allWords is still used for timing)
  noSubtitles?: boolean;
  // Actual audio file duration in seconds (from ffprobe). When set, used as the
  // authoritative minimum video length so the voiceover never gets clipped.
  voiceoverDurationSeconds?: number;
}

export interface ResolvedAssets {
  sceneAssets: (string | null)[];
  voiceoverPath: string | null;
  musicPath: string | null;
  sceneWords: WordTimestamp[][]; // per-scene words (for duration calculation only)
  allWords: WordTimestamp[]; // full absolute timestamps from TTS
  sceneSourceDurations: (number | null)[]; // source video durations in seconds (stock_video and ai_video)
  voiceoverDurationSeconds?: number; // actual audio file duration from ffprobe
}

export function mapScoreToProps(
  score: DirectorScore,
  assets: ResolvedAssets,
  fps: number = 30,
  noSubtitles?: boolean,
): CompositionProps {
  const archetype = getArchetype(score.archetype);

  // Proportional word-count duration: language-agnostic and reliable regardless of
  // whether Whisper can accurately transcribe the audio language.
  // Each scene gets (its word count / total words) × total audio duration.
  // Falls back to timestamp-based only when voiceoverDurationSeconds is unavailable.
  const totalAudio = assets.voiceoverDurationSeconds ?? 0;
  const sceneCounts = score.scenes.map((s) =>
    s.script_line.split(/\s+/).filter(Boolean).length,
  );
  const totalWords = sceneCounts.reduce((a, b) => a + b, 0);

  const scenes: SceneProps[] = score.scenes.map((scene, i) => {
    const words = assets.sceneWords[i] ?? [];
    let durationSeconds: number;

    if (totalAudio > 0 && totalWords > 0) {
      // Primary: proportional word count — works for any language, any TTS provider
      const proportion = (sceneCounts[i] ?? 1) / totalWords;
      durationSeconds = Math.max(proportion * totalAudio, 2);
    } else {
      // Fallback: timestamp-based (original approach, requires accurate Whisper)
      const lastWord = words[words.length - 1];
      const firstWord = words[0];
      const nextSceneFirstWord = assets.sceneWords[i + 1]?.[0];
      if (nextSceneFirstWord && firstWord) {
        durationSeconds = Math.max(nextSceneFirstWord.start - firstWord.start, 2);
      } else if (lastWord && firstWord) {
        durationSeconds = Math.max(lastWord.end - firstWord.start + 0.5, 2);
      } else {
        durationSeconds = 3;
      }
    }

    const durationInFrames = Math.round(durationSeconds * fps);

    // Detect AI fallback: if the score says stock/ai_video but the asset is a PNG,
    // the resolver fell back to AI image generation.
    const assetSrc = assets.sceneAssets[i] ?? null;
    let visualType = scene.visual_type;
    let motion = scene.motion;
    if (
      (visualType === "stock_video" || visualType === "stock_image" || visualType === "ai_video") &&
      assetSrc?.endsWith("-ai.png")
    ) {
      visualType = "ai_image";
      // ai_video scenes use motion="static" since the video provides motion.
      // On fallback to still image, force Ken Burns zoom so it's not completely static.
      if (motion === "static") {
        motion = "zoom_in";
      }
    }

    return {
      visualType,
      assetSrc,
      motion,
      visualPrompt: scene.visual_prompt,
      scriptLine: scene.script_line,
      durationInFrames,
      words, // per-scene words kept for scene duration calc, not used for captions
      colorPalette: archetype.colorPalette,
      textCardFont: archetype.textCardFont,
      motionIntensity: archetype.motionIntensity,
      startFrom: 0,
      sourceDurationInSeconds: assets.sceneSourceDurations[i] ?? undefined,
      transition: scene.transition ?? archetype.defaultTransition ?? "none",
      transitionDurationFrames: archetype.transitionDurationFrames ?? 15,
    };
  });

  return {
    scenes,
    captionStyle: archetype.captionStyle,
    voiceoverSrc: assets.voiceoverPath,
    musicSrc: assets.musicPath,
    allWords: assets.allWords,
    captionAccentColor: archetype.colorPalette.accent,
    captionChunkSize: archetype.captionChunkSize ?? 5,
    captionLingerS: archetype.captionLingerS ?? 0.3,
    noSubtitles: noSubtitles === true,
    voiceoverDurationSeconds: assets.voiceoverDurationSeconds,
  };
}

export function getTotalDurationInFrames(props: CompositionProps, fps: number = 30): number {
  const sceneDuration = props.scenes.reduce((sum, s) => sum + s.durationInFrames, 0);
  const transitionOverlap = props.scenes.reduce((sum, s, i) => {
    if (i < props.scenes.length - 1 && s.transition !== "none") {
      return sum + s.transitionDurationFrames;
    }
    return sum;
  }, 0);

  const adjusted = sceneDuration - transitionOverlap;

  // Voiceover is the spine — composition must be at least as long as the full audio.
  // Prefer the actual file duration (from ffprobe) over word timestamps, which may
  // not account for trailing silence added by TTS providers.
  const wordBasedEnd = props.allWords[props.allWords.length - 1]?.end ?? 0;
  const voiceoverEnd = Math.max(wordBasedEnd, props.voiceoverDurationSeconds ?? 0);
  const minFrames = Math.ceil(voiceoverEnd * fps);

  // WARNING: This mutates props.scenes[last].durationInFrames to prevent black frames.
  // Only call once per render pass. Calling twice on the same props will grow the last scene unboundedly.
  const lastScene = props.scenes[props.scenes.length - 1];
  if (adjusted < minFrames && lastScene) {
    const deficit = minFrames - adjusted;
    // Guard: don't extend ai_video scenes past their source duration to prevent looping.
    // AI-generated video clips create visible seams when looped, unlike stock footage.
    if (lastScene.visualType === "ai_video" && lastScene.sourceDurationInSeconds) {
      const maxFrames = Math.ceil(lastScene.sourceDurationInSeconds * fps);
      const originalDuration = lastScene.durationInFrames;
      const cappedDuration = Math.min(originalDuration + deficit, maxFrames);
      lastScene.durationInFrames = cappedDuration;
      return sceneDuration - transitionOverlap + (cappedDuration - originalDuration);
    }
    lastScene.durationInFrames += deficit;
    return minFrames;
  }

  return adjusted;
}
