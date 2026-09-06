import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { getArchetype, listArchetypes } from "../config/archetype-registry.js";
import type { ScenePacing } from "../schema/archetype.js";
import { loadPlaybook } from "../config/playbook.js";
import {
  filmSceneTarget,
  filmWordsTarget,
  isFilmJob,
  isFilmOneMinute,
  isFilmTestMinutes,
  normalizeFilmMinutes,
} from "../config/film-duration.js";
import { countLockedCharacters, countLockedLocations } from "../library/identity.js";
import { videoSceneModeGuidance } from "../pipeline/video-scene-mode.js";
import { DirectorScore, DirectorScoreBase, Motion, MusicMood, TransitionType, VisualType } from "../schema/director-score.js";
import type { LLMProvider, LLMUsage } from "../schema/providers.js";
import type { ResearchResult } from "./research.js";
import type { CritiqueResult } from "./critic.js";

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), "prompts", "creative-director.md");

// Schema for LLM generation output. Intentionally omits min/max on the scenes
// array because Gemini's structured-output API rejects minItems > 1 in JSON
// Schema. Scene count is guided by pacing instructions in the prompt, then
// enforced by DirectorScore.parse() (which keeps .min(3).max(16)).
const DirectorScoreRaw = z.object({
  emotional_arc: z.string(),
  archetype: z.enum(listArchetypes() as [string, ...string[]]),
  music_mood: MusicMood.catch("epic_cinematic"),
  scenes: z.array(
    z.object({
      visual_type: VisualType,
      visual_prompt: z.string(),
      motion: Motion.catch("static"),
      script_line: z.string(),
      transition: TransitionType.nullable().catch(null),
      shot_type: z.string().optional(),
      camera_move: z.string().optional(),
      location: z.string().optional(),
    }),
  ),
});

export interface DirectorScoreOutput {
  data: DirectorScore;
  usage: LLMUsage;
}

/** Load the creative director system prompt with playbook injection */
function loadDirectorSystemPrompt(targetDurationMinutes?: number, platform?: string): string {
  let systemPrompt = buildDefaultPrompt();

  try {
    systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  } catch {
    // Use default
  }

  const minutes = normalizeFilmMinutes(targetDurationMinutes);
  if (minutes && isFilmJob(minutes, platform)) {
    const isLandscape = platform === "youtube_horizontal";
    const isTest = isFilmTestMinutes(minutes);
    const formatDesc = isLandscape
      ? isTest
        ? `30-second horizontal test film (1920x1080 landscape 16:9)`
        : `long-form horizontal video content (${minutes}-minute videos, 1920x1080 landscape 16:9)`
      : `long-form vertical video content (${minutes}-minute videos, 1080x1920 portrait)`;
    const wordsTarget = filmWordsTarget(minutes);
    systemPrompt = systemPrompt
      .replace(
        /You are a Creative Director for short-form vertical video content[^.]*\./,
        `You are a Creative Director for ${formatDesc}.`,
      )
      .replace(
        /Keep total script under \d+ words[^.]*\./g,
        `Total script target: approximately ${wordsTarget} words (${isTest ? "30 seconds" : `${minutes} minutes`} at ~150 words/minute).`,
      )
      // Remove the short-form CTA enforcement — long-form ends with a proper conclusion + CTA
      .replace(
        /\*\*CTA scene \(FINAL scene, REQUIRED\)\*\*:.*?(?=\n-|\n##|\n\n)/gs,
        isLandscape
          ? `**CTA scene (FINAL scene)**: spoken closing line or cliffhanger. No text_card. Same CAST identity rules as every other shot.`
          : isTest
            ? `**CTA scene (FINAL scene)**: one spoken closing line. No text_card. Same character as every other shot.`
            : `**CTA scene (FINAL scene, REQUIRED)**: 20-40 words. Summarize the key takeaway, then add a call-to-action (like/subscribe/comment prompt). Typically a text_card followed by a closing visual.`,
      );

    const sceneCount = filmSceneTarget(minutes);
    const wordsPerScene = Math.round(wordsTarget / sceneCount);

    systemPrompt += isTest
      ? `

## 30-SECOND TEST FILM OVERRIDE

This is a FAST TEST, not a Short and not an 8-minute Film.

- **Scene count**: exactly ${sceneCount} scenes total
- **Words per scene**: ${Math.max(8, wordsPerScene - 2)}-${wordsPerScene + 2} words (~5 seconds per scene)
- **Total word budget**: ~${wordsTarget} words
- **NO text_card. NO chapter titles.**
- If ai_video is allowed, EVERY scene is ai_video (fluidity).
- The SAME character in every visual_prompt: copy crest, patches, markings, species verbatim.
- **DO NOT** apply short-form pacing tiers
- **DO NOT** exceed ${sceneCount} scenes`
      : isLandscape
        ? `

## LONG-FORM VIDEO OVERRIDE

This is a LONG-FORM YouTube horizontal film, NOT a Short. Apply these rules instead of the short-form pacing table:

- **Scene count**: exactly ${sceneCount} scenes total
- **Words per scene**: ${wordsPerScene - 2}-${wordsPerScene + 2} words (~5 seconds per scene)
- **Total word budget**: ~${wordsTarget} words
- **NO text_card. NO chapter title cards. NO on-screen typography.**
- Every scene is a cinematic shot (ai_image or ai_video). Contrast via camera, not title cards.
- **DO NOT** apply short-form pacing tiers (fast/moderate/cinematic)
- **DO NOT** exceed ${sceneCount} scenes`
        : `

## LONG-FORM VIDEO OVERRIDE

This is a LONG-FORM Reel Extend video, NOT a Short. Apply these rules instead of the short-form pacing table:

- **Scene count**: exactly ${sceneCount} scenes total
- **Words per scene**: ${wordsPerScene - 2}-${wordsPerScene + 2} words (~5 seconds per scene)
- **Total word budget**: ~${wordsTarget} words
- **Structure**: Opening hook (2-3 scenes) → Multiple topic chapters (5-8 scenes each) → Conclusion + CTA (2-3 scenes)
- **Chapter breaks**: Every 5-8 scenes, use a text_card as a chapter title card
- **DO NOT** apply short-form pacing tiers (fast/moderate/cinematic)
- **DO NOT** exceed ${sceneCount} scenes`;
  }

  // Inject full playbook for content strategy guidance
  try {
    const playbook = loadPlaybook();
    systemPrompt += "\n\n## Reference: Content Playbook\n\n" + playbook;
  } catch (err) {
    console.warn(`[creative-director] Playbook not loaded: ${err}`);
  }

  return systemPrompt;
}

const ALL_VISUAL_TYPES = ["ai_image", "stock_image", "stock_video", "text_card", "ai_video"] as const;

function characterSection(lock?: string, castMode?: string): string {
  const hero = castMode === "hero";
  if (lock?.trim()) {
    const named = lock.match(/\bName:\s*/gi)?.length ?? 0;
    if (hero) {
      return `\n## CHARACTER IDENTITY LOCK — FOLLOW-CAM HERO\n${lock.trim()}\nThe FIRST named CAST member is the optical axis of ONE continuous take split into clips. Every visual_prompt is the NEXT BEAT of the same shot — not a new portrait, not a location plate.\nCamera TRACKS the body (camera_move: track, pan, or push_in). The world and props attach to or scroll around the hero.\nEach visual_prompt has THREE beats (start / mid / end): action, attached object or environment change, match-cut end pose (facing, hands, stride) that the next scene inherits exactly.\nOther CAST members join ONLY when that script_line names them; they enter the same take and never replace the hero.\nPrefer ai_video. Still images are a last resort.\n`;
    }
    if (named >= 2) {
      return `\n## CHARACTER IDENTITY LOCK\n${lock.trim()}\nNamed CAST of ${named}. Each named individual keeps their own species, race, markings, age, and face. Do not merge, swap, or replace anyone.\nON SCREEN RULE: a visual_prompt may show ONLY the character(s) named in THAT scene's script_line. If the line is about one person, the others must be absent — not even in the background. Show two or more together only when the line names them together. Do NOT paste the full CAST bible into every visual_prompt; copy only the on-screen person's appearance.\n`;
    }
    return `\n## CHARACTER IDENTITY LOCK\n${lock.trim()}\nThe SAME individual in every visual_prompt. Never change species, race, markings, age, or face. Do not swap an ocelot for a Bengal tiger, a coatí for a fox/raccoon, or a cub for an adult. Contrast via camera and emotion only.\n`;
  }
  if (hero) {
    return `\n## FOLLOW-CAM HERO\nA single protagonist is the optical axis of ONE continuous take. Camera tracks the body; the world scrolls or transforms around them. Never atmosphere-only or a jump-cut portrait. Three beats per clip; close with a match-cut pose the next inherits. Prefer ai_video.\n`;
  }
  return `\n## CHARACTER CONTINUITY\nIf the story has a recurring character (animal or person), lock species, race, age, markings, and face in EVERY visual_prompt. Repeat the exact description. Never morph to a similar species.\n`;
}

function locationSection(lock?: string): string {
  if (!lock?.trim()) return "";
  const named = lock.match(/\bName:\s*/gi)?.length ?? 0;
  if (named >= 2) {
    return `\n## LOCATION ROSTER (never combine)\n${lock.trim()}\nEach scene uses EXACTLY ONE named place. Never collage, split-screen, morph, or mix two roster locations in one visual_prompt. Neighboring shots MAY change location. scene.location MUST be the exact roster Name of that one place. Do NOT paste every location into every prompt; copy only the active place.\n`;
  }
  return `\n## LOCATION LOCK\n${lock.trim()}\nThe SAME named place in every visual_prompt unless the narration clearly moves. Do not morph it into a different building or landscape.\n`;
}

function objectSection(lock?: string): string {
  if (!lock?.trim()) return "";
  return `\n## OBJECT / PROP ROSTER (may appear together)\n${lock.trim()}\nThese named props MAY share a frame when the action needs them. Include the ones the script_line names; others are optional if they belong in that place. Do not invent objects outside this roster. Do not turn a prop into a different model/brand.\n`;
}

function buildVisualTypesInstruction(allowedVisualTypes?: string[], videoEnabled?: boolean): { visualTypes: string; hasVideo: boolean } {
  // Derive allowed set: explicit list wins, else fall back to videoEnabled flag
  const allowed = allowedVisualTypes && allowedVisualTypes.length > 0
    ? allowedVisualTypes
    : videoEnabled
      ? ["ai_image", "stock_image", "stock_video", "text_card", "ai_video"]
      : ["ai_image", "stock_image", "stock_video", "text_card"];

  const hasVideo = allowed.includes("ai_video");
  const visualTypes = `ONLY these visual types: ${allowed.join(", ")}. Do NOT use any other type.`;
  return { visualTypes, hasVideo };
}

export async function generateDirectorScore(
  llm: LLMProvider,
  topic: string,
  researchContext: ResearchResult,
  options?: { archetype?: string; pacing?: string; videoEnabled?: boolean; allowedVisualTypes?: string[]; direction?: string; targetDurationMinutes?: number; platform?: string; characterLock?: string; locationLock?: string; objectLock?: string; artStyleOverride?: string; videoSceneMode?: string; castMode?: string },
): Promise<DirectorScoreOutput> {
  const systemPrompt = loadDirectorSystemPrompt(options?.targetDurationMinutes, options?.platform);

  const archetypes = listArchetypes();
  const archetypeInstruction = options?.archetype
    ? `Use the "${options.archetype}" archetype. Do not switch to watercolor, anime, or another look.`
    : `Choose from: ${archetypes.join(", ")}`;

  const { visualTypes, hasVideo } = buildVisualTypesInstruction(options?.allowedVisualTypes, options?.videoEnabled);
  const videoGuidance = videoSceneModeGuidance(options?.videoSceneMode, hasVideo);

  // Resolve pacing tier: explicit --pacing override > archetype default > lookup table
  const pacingInstruction = buildPacingInstruction(options?.archetype, options?.pacing, options?.targetDurationMinutes, options?.platform);

  const directionSection = options?.direction?.trim()
    ? `\n## Creative Direction (from the producer)\n\n${options.direction}\n\nHonor these creative constraints while exercising your judgment on anything not specified.\n`
    : "";

  const filmMinutes = normalizeFilmMinutes(options?.targetDurationMinutes);
  const isLongForm = isFilmJob(filmMinutes, options?.platform);
  const isTest = isFilmTestMinutes(filmMinutes);
  const wordsTarget = isLongForm && filmMinutes ? filmWordsTarget(filmMinutes) : null;
  const sceneTarget = isLongForm && filmMinutes ? filmSceneTarget(filmMinutes) : null;
  const wordsPerSceneTarget = isLongForm && wordsTarget && sceneTarget ? Math.round(wordsTarget / sceneTarget) : null;
  const castCount = countLockedCharacters(options?.characterLock);
  const locationCount = countLockedLocations(options?.locationLock);

  const userMessage = `Topic: ${topic}

Research context:
${researchContext.summary}

Key facts:
${researchContext.key_facts.map((f) => `- ${f}`).join("\n")}

Mood: ${researchContext.mood}

${archetypeInstruction}

${pacingInstruction}
Use ${visualTypes}.${videoGuidance}
${directionSection}${characterSection(options?.characterLock, options?.castMode)}${locationSection(options?.locationLock)}${objectSection(options?.objectLock)}${options?.artStyleOverride?.trim() ? `\n## ART STYLE LOCK\n${options.artStyleOverride.trim()}\nEvery visual_prompt stays in this look. Do not switch photoreal ↔ cartoon/watercolor.\n` : ""}${options?.castMode === "hero" && hasVideo
  ? "FOLLOW-CAM OVERRIDE: every AI scene is ai_video (motion static). Ignore the usual 'do not repeat visual_type' rule — repetition here is the continuous take."
  : "CRITICAL RULE: Never use the same visual_type more than 2 times in a row. With more scenes, plan your visual_type sequence BEFORE writing scenes to ensure variety."}
Every scene MUST have a script_line (the voiceover text).
The first scene should be a strong hook.
${isLongForm
  ? isTest
    ? `MANDATORY: This is a 30-second TEST film. Generate exactly ${sceneTarget} scenes with ~${wordsPerSceneTarget} words each. Total ~${wordsTarget} words. NO text_card. If ai_video is allowed, every scene is ai_video. ${
        options?.castMode === "hero"
          ? "FOLLOW-CAM HERO: one continuous take. The first CAST member is the optical axis of every clip. Camera tracks the body. Three beats + match-cut pose. Prefer ai_video. Never atmosphere-only."
          : castCount >= 2
            ? "Keep each CAST member's species, markings and face. Do not merge or swap identities."
            : "Same character (crest, patches, species) in every visual_prompt."
      }`
    : isFilmOneMinute(filmMinutes)
      ? `MANDATORY: This is a 1-minute film. Generate exactly ${sceneTarget} scenes with ~${wordsPerSceneTarget} words each. Total ~${wordsTarget} words. NO text_card. Hook, advance the plot, cliffhanger CTA. ${
          options?.castMode === "hero"
            ? "FOLLOW-CAM HERO: one continuous take. Camera tracks the first CAST member. World and props attach to the body. Three beats + match-cut. Prefer ai_video."
            : castCount >= 2
              ? "Keep each CAST member's species, markings and face. Only the character named in that script_line is on screen."
              : "Same character in every visual_prompt."
        }`
      : options?.platform === "youtube_horizontal"
        ? `MANDATORY: This is a ${filmMinutes}-minute YouTube horizontal film. Generate exactly ${sceneTarget} scenes with ~${wordsPerSceneTarget} words each. Total word count MUST be ~${wordsTarget} words. NO text_card. No chapter title cards. Stop at exactly ${sceneTarget} scenes.`
        : `MANDATORY: This is a ${filmMinutes}-minute video. Generate exactly ${sceneTarget} scenes with ~${wordsPerSceneTarget} words each. Total word count MUST be ~${wordsTarget} words. Break topic into chapters separated by text_card chapter titles. Stop at exactly ${sceneTarget} scenes.`
  : "If over budget, cut a scene rather than cramming."
}${options?.platform === "youtube_horizontal" ? `\nEvery AI visual_prompt must start with: 16:9 landscape widescreen cinematic frame, full-bleed, no letterbox bars.\nFor every ai_image/ai_video scene set shot_type (wide_establishing|wide|medium|close_up|extreme_close_up|over_shoulder|aerial|insert), camera_move (static|push_in|pull_out|pan|track), and location (${
    locationCount >= 2
      ? "the exact Name of ONE roster place — never two names"
      : "a short reusable place name"
  }). Neighboring AI shots must not share the same shot_type. ${
    locationCount >= 2
      ? "Never combine two roster locations in one frame."
      : "Repeat the same location name when the action stays in that place."
  }` : ""}`;

  const maxRetries = 3;
  let lastError: Error | null = null;
  const totalUsage: LLMUsage = { inputTokens: 0, outputTokens: 0 };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await llm.generate({
        systemPrompt,
        userMessage:
          attempt > 0
            ? `${userMessage}\n\nPREVIOUS ATTEMPT FAILED: ${lastError?.message}. Fix the issue.`
            : userMessage,
        schema: DirectorScoreRaw,
      });

      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;

      // Remap types the current run cannot produce (e.g. stock with no Pexels key),
      // then auto-repair golden rule violations before strict validation.
      // Hero follow-cam and single-type runs skip repair + the Zod refine
      // (all clips are ai_video on purpose).
      const allowedTypes = options?.allowedVisualTypes ?? [];
      remapDisallowedVisualTypes(result.data.scenes, allowedTypes);
      const skipGolden = shouldSkipGoldenRule(allowedTypes, options?.castMode);
      repairGoldenRule(result.data.scenes, allowedTypes, skipGolden);

      const validated = skipGolden
        ? (DirectorScoreBase.parse(result.data) as DirectorScore)
        : DirectorScore.parse(result.data);
      return { data: validated, usage: totalUsage };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[creative-director] Attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }

  throw new Error(`Creative Director failed after ${maxRetries} attempts: ${lastError?.message}`);
}

function buildDefaultPrompt(): string {
  return `You are a Creative Director for short-form video content. Your job is to create a detailed per-scene production plan (DirectorScore) that will drive the entire video creation pipeline.

You must output a DirectorScore with:
- emotional_arc: A journey descriptor (e.g., "curiosity-to-wisdom", "shock-to-understanding")
- archetype: Visual style that drives transitions, colors, and captions
- music_mood: MUST be exactly one of: "epic_cinematic", "tense_electronic", "chill_lofi", "uplifting_pop", "mysterious_ambient", "warm_acoustic", "dark_cinematic", "dreamy_ethereal"
- scenes: Array of scenes following the archetype's recommended pacing tier

GOLDEN RULE: Never use the same visual_type more than 2 times consecutively. Mix ai_image, stock_image, stock_video, and text_card for variety.

Think like a YouTube Shorts producer. The hook must grab in 1-2 seconds. Every scene should move the story forward. The FINAL scene MUST be a call-to-action (e.g. "What would you have done? Comment below."), not a story conclusion.

Keep total script under 140 words — verbose scripts create rushed, unwatchable videos.`;
}

// --- Pacing tier configuration ---

const PACING_CONFIG: Record<ScenePacing, { min: number; max: number; wordsPerScene: string; totalWords: string }> = {
  fast: { min: 16, max: 22, wordsPerScene: "10-14", totalWords: "210-260" },
  moderate: { min: 14, max: 18, wordsPerScene: "12-16", totalWords: "210-260" },
  cinematic: { min: 10, max: 14, wordsPerScene: "16-22", totalWords: "210-265" },
};

const PACING_TIER_TABLE = `After choosing your archetype, use the matching pacing tier from this table:
- fast (16-22 scenes, 10-14 words/scene, 210-260 words total): infographic, bold_illustration, comic_book
- moderate (14-18 scenes, 12-16 words/scene, 210-260 words total): warm_editorial, editorial_caricature, anime_illustration, vintage_snapshot, surreal_dreamscape, gothic_fantasy, style_override
- cinematic (10-14 scenes, 16-22 words/scene, 210-265 words total): cinematic_documentary, moody_cinematic, studio_realism, warm_narrative, pastoral_watercolor`;

export function buildPacingInstruction(archetype?: string, pacingOverride?: string, targetDurationMinutes?: number, platform?: string): string {
  const minutes = normalizeFilmMinutes(targetDurationMinutes);
  if (minutes && isFilmJob(minutes, platform)) {
    const isLandscape = platform === "youtube_horizontal";
    const isTest = isFilmTestMinutes(minutes);
    const formatLabel = isLandscape ? "YouTube Horizontal (landscape 16:9)" : "Reel Extend vertical";
    const wordsTarget = filmWordsTarget(minutes);
    const sceneCount = filmSceneTarget(minutes);
    const wordsPerScene = Math.round(wordsTarget / sceneCount);
    if (isTest) {
      console.log(`[creative-director] 30s test pacing (${formatLabel}): ${sceneCount} scenes (~${wordsTarget} words)`);
      return `This is a ${formatLabel} 30-SECOND TEST.
Create a DirectorScore with exactly ${sceneCount} scenes.
Per-scene word budget: ${Math.max(8, wordsPerScene - 2)}-${wordsPerScene + 2} words (~5 seconds per scene).
Total word budget: approximately ${wordsTarget} words.
NO text_card. If ai_video is allowed, every scene is ai_video.
The same character (crest, black patches, markings, species) appears in every visual_prompt.`;
    }
    console.log(`[creative-director] Long-form pacing (${formatLabel}): ~${sceneCount} scenes for ${minutes} min (~${wordsTarget} words, ~${wordsPerScene} words/scene)`);
    const noCards = isLandscape ? "\nNO text_card. No chapter title cards. Every scene is a cinematic shot." : "";
    const structure = isFilmOneMinute(minutes)
      ? "Structure: hook (1-2 scenes), rising action, cliffhanger CTA. Do not pad with chapter titles."
      : isLandscape
        ? "Structure: engaging intro, rising chapters as cinematic scenes (not title cards), strong conclusion with spoken CTA."
        : "Structure: engaging intro (2-3 scenes), multiple topic chapters of 5-8 scenes each, strong conclusion with CTA (2-3 scenes).\nEach chapter must have a clear thematic focus. Vary visual types throughout.";
    return `This is a ${formatLabel} video targeting ${minutes} minutes.
Create a DirectorScore with exactly ${sceneCount} scenes.
Per-scene word budget: ${wordsPerScene - 2}-${wordsPerScene + 2} words (~5 seconds per scene at 150 words/minute).
Total word budget: approximately ${wordsTarget} words at ~150 words/minute.
${structure}${noCards}`;
  }

  // Path 1: Explicit --pacing override always wins
  if (pacingOverride && pacingOverride in PACING_CONFIG) {
    const tier = pacingOverride as ScenePacing;
    const cfg = PACING_CONFIG[tier];
    console.log(`[creative-director] Using ${tier} pacing (${cfg.min}-${cfg.max} scenes) — explicit override`);
    return `Use ${tier} pacing. Create a DirectorScore with ${cfg.min}-${cfg.max} scenes.
Per-scene word budget: ${cfg.wordsPerScene} words. Total word budget: ${cfg.totalWords} words.`;
  }

  // Path 2: Archetype specified — derive tier from config
  if (archetype) {
    try {
      const config = getArchetype(archetype);
      const tier = config.scenePacing;
      const cfg = PACING_CONFIG[tier];
      console.log(`[creative-director] Using ${tier} pacing (${cfg.min}-${cfg.max} scenes) for archetype ${archetype}`);
      return `This archetype uses ${tier} pacing. Create a DirectorScore with ${cfg.min}-${cfg.max} scenes.
Per-scene word budget: ${cfg.wordsPerScene} words. Total word budget: ${cfg.totalWords} words.`;
    } catch {
      // Unknown archetype — fall through to table
    }
  }

  // Path 3: No archetype specified — LLM picks, include full tier table
  console.log("[creative-director] No archetype specified — injecting pacing tier lookup table");
  return PACING_TIER_TABLE;
}

export { PACING_CONFIG };

// ── Golden rule auto-repair ───────────────────────────────────────────────────

// Returns true when the user has chosen a single "real" visual type (text_card
// is structural and doesn't count). In this case the golden rule cannot be
// satisfied and must be skipped entirely.
function isSingleVisualTypeMode(allowedTypes: string[]): boolean {
  const realTypes = allowedTypes.filter((t) => t !== "text_card");
  return realTypes.length === 1;
}

/** Hero follow-cam and single-type runs cannot satisfy the slideshow golden rule. */
function shouldSkipGoldenRule(allowedTypes: string[], castMode?: string): boolean {
  return castMode === "hero" || isSingleVisualTypeMode(allowedTypes);
}

/** Force scenes onto the allowed palette when the LLM ignores type constraints. */
export function remapDisallowedVisualTypes(
  scenes: Array<{ visual_type: string; [key: string]: unknown }>,
  allowedTypes: string[],
): void {
  if (allowedTypes.length === 0) return;
  const allowed = new Set(allowedTypes);
  const fallback = allowedTypes.find((t) => t !== "text_card") ?? allowedTypes[0]!;
  for (const scene of scenes) {
    if (!allowed.has(scene.visual_type)) {
      console.warn(
        `[creative-director] Remapped visual_type "${scene.visual_type}" → "${fallback}"`,
      );
      scene.visual_type = fallback;
    }
  }
}

// When VIVI (or any LLM) violates the golden rule (3+ consecutive same visual_type),
// auto-fix by rotating the offending scene to a different allowed type.
// Skipped entirely when only one visual type is allowed.
export function repairGoldenRule(
  scenes: Array<{ visual_type: string; [key: string]: unknown }>,
  allowedTypes: string[],
  skip = false,
): void {
  if (skip || isSingleVisualTypeMode(allowedTypes)) return;

  const pool = allowedTypes.length > 0 ? allowedTypes : [...ALL_VISUAL_TYPES];

  for (let i = 2; i < scenes.length; i++) {
    const prev2 = scenes[i - 2]?.visual_type;
    const prev1 = scenes[i - 1]?.visual_type;
    const curr = scenes[i]?.visual_type;
    if (prev2 === prev1 && prev1 === curr) {
      // Pick a type that differs from prev1
      const alt = pool.find((t) => t !== prev1) ?? pool[0];
      if (alt) {
        console.warn(
          `[creative-director] Golden rule repair: scene ${i} changed from "${curr}" to "${alt}"`,
        );
        scenes[i]!.visual_type = alt;
      }
    }
  }
}

// ── Revision ─────────────────────────────────────────────────────────────────

export async function reviseDirectorScore(
  llm: LLMProvider,
  topic: string,
  researchContext: ResearchResult,
  originalScore: DirectorScore,
  critique: CritiqueResult,
  options?: { archetype?: string; pacing?: string; videoEnabled?: boolean; allowedVisualTypes?: string[]; direction?: string; targetDurationMinutes?: number; platform?: string; characterLock?: string; locationLock?: string; objectLock?: string; artStyleOverride?: string; videoSceneMode?: string; castMode?: string },
): Promise<DirectorScoreOutput> {
  const systemPrompt = loadDirectorSystemPrompt(options?.targetDurationMinutes, options?.platform);

  // Build revision instructions from critique, guarding nullable revision_instructions
  const revisionGuidance = critique.revision_instructions
    ?? `Address these weaknesses: ${critique.weaknesses.join("; ")}`;

  const pacingInstruction = buildPacingInstruction(options?.archetype, options?.pacing, options?.targetDurationMinutes, options?.platform);

  const { visualTypes, hasVideo: reviseHasVideo } = buildVisualTypesInstruction(options?.allowedVisualTypes, options?.videoEnabled);
  const videoGuidance = videoSceneModeGuidance(options?.videoSceneMode, reviseHasVideo);

  const directionSection = options?.direction?.trim()
    ? `\n## Creative Direction (from the producer)\n\n${options.direction}\n\nHonor these creative constraints while exercising your judgment on anything not specified.\n`
    : "";

  const userMessage = `Topic: ${topic}

Research context:
${researchContext.summary}

Key facts:
${researchContext.key_facts.map((f) => `- ${f}`).join("\n")}

Mood: ${researchContext.mood}

${pacingInstruction}
Use ${visualTypes}.${videoGuidance}
${directionSection}${characterSection(options?.characterLock, options?.castMode)}${locationSection(options?.locationLock)}${objectSection(options?.objectLock)}
## Current Plan (score: ${critique.score}/10)

${JSON.stringify(originalScore, null, 2)}

## Critic Feedback

Strengths: ${critique.strengths.join(", ")}
Weaknesses: ${critique.weaknesses.join(", ")}
${critique.weakest_scene_index != null ? `Weakest scene: Scene ${critique.weakest_scene_index}` : ""}

## Revision Instructions

${revisionGuidance}

Revise the DirectorScore to address the weaknesses while preserving the strengths.
Keep the same archetype. ${
  options?.castMode === "hero"
    ? "FOLLOW-CAM: keep every AI scene as ai_video. Do not insert stills to vary visual_type."
    : "Maintain the GOLDEN RULE: never use the same visual_type more than 2 times in a row."
}
${options?.direction?.trim() ? "LOCKED NARRATION: do not rewrite script_line. Only change visual_type, visual_prompt, motion, transition, shot_type, camera_move, and location." : ""}
${options?.characterLock?.trim()
      ? options?.castMode === "hero"
        ? `IDENTITY: FOLLOW-CAM HERO — one continuous take. Inherit last pose and camera travel. Camera tracks the first CAST member. Guests join the same take only when named. Prefer ai_video. Never a new portrait or atmosphere-only.`
        : `IDENTITY: keep each CAST member's appearance when they are ON SCREEN. Do not paste the full CAST into every visual_prompt. If script_line names one person, the others stay off camera.`
      : ""}
${options?.locationLock?.trim() ? `LOCATION: each scene is ONE roster place only. Never combine two locations in one frame. scene.location must be that place's Name.` : ""}
${options?.artStyleOverride?.trim() ? `ART STYLE LOCK: ${options.artStyleOverride.trim()}. Do not switch photoreal ↔ cartoon.` : ""}
${options?.platform === "youtube_horizontal" ? "Every AI visual_prompt must start with: 16:9 landscape widescreen cinematic frame, full-bleed, no letterbox bars. Fill shot_type, camera_move, and a reusable location. Neighboring AI shots must not share the same shot_type." : ""}`;

  const maxRetries = 2;
  let lastError: Error | null = null;
  const totalUsage: LLMUsage = { inputTokens: 0, outputTokens: 0 };

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await llm.generate({
        systemPrompt,
        userMessage:
          attempt > 0
            ? `${userMessage}\n\nPREVIOUS ATTEMPT FAILED: ${lastError?.message}. Fix the issue.`
            : userMessage,
        schema: DirectorScoreRaw,
      });

      totalUsage.inputTokens += result.usage.inputTokens;
      totalUsage.outputTokens += result.usage.outputTokens;

      const allowedTypesRev = options?.allowedVisualTypes ?? [];
      remapDisallowedVisualTypes(result.data.scenes, allowedTypesRev);
      const skipGoldenRev = shouldSkipGoldenRule(allowedTypesRev, options?.castMode);
      repairGoldenRule(result.data.scenes, allowedTypesRev, skipGoldenRev);

      const validated = skipGoldenRev
        ? (DirectorScoreBase.parse(result.data) as DirectorScore)
        : DirectorScore.parse(result.data);

      // Prevent archetype drift: the LLM may change the archetype during revision
      // despite prompt instructions. Force it back to the original.
      if (validated.archetype !== originalScore.archetype) {
        (validated as { archetype: string }).archetype = originalScore.archetype;
      }

      return { data: validated, usage: totalUsage };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[creative-director] Revision attempt ${attempt + 1} failed: ${lastError.message}`);
    }
  }

  throw new Error(`Revision failed after ${maxRetries} attempts: ${lastError?.message}`);
}
