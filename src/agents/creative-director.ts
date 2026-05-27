import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { getArchetype, listArchetypes } from "../config/archetype-registry.js";
import type { ScenePacing } from "../schema/archetype.js";
import { loadPlaybook } from "../config/playbook.js";
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
    }),
  ),
});

export interface DirectorScoreOutput {
  data: DirectorScore;
  usage: LLMUsage;
}

/** Load the creative director system prompt with playbook injection */
function loadDirectorSystemPrompt(targetDurationMinutes?: number): string {
  let systemPrompt = buildDefaultPrompt();

  try {
    systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  } catch {
    // Use default
  }

  // For long-form horizontal video, override the short-form constraints in the system prompt
  if (targetDurationMinutes && targetDurationMinutes >= 5) {
    const wordsTarget = Math.round(targetDurationMinutes * 150);
    systemPrompt = systemPrompt
      .replace(
        /You are a Creative Director for short-form vertical video content[^.]*\./,
        `You are a Creative Director for long-form vertical video content (${targetDurationMinutes}-minute videos, 1080x1920 portrait).`,
      )
      .replace(
        /Keep total script under \d+ words[^.]*\./g,
        `Total script target: approximately ${wordsTarget} words (${targetDurationMinutes} minutes at ~150 words/minute).`,
      )
      // Remove the short-form CTA enforcement — long-form ends with a proper conclusion + CTA
      .replace(
        /\*\*CTA scene \(FINAL scene, REQUIRED\)\*\*:.*?(?=\n-|\n##|\n\n)/gs,
        `**CTA scene (FINAL scene, REQUIRED)**: 20-40 words. Summarize the key takeaway, then add a call-to-action (like/subscribe/comment prompt). Typically a text_card followed by a closing visual.`,
      );

    const MAX_SCENES = 30;
    const sceneCount = Math.min(Math.round(wordsTarget / 45), MAX_SCENES);
    const wordsPerScene = Math.round(wordsTarget / sceneCount);

    systemPrompt += `

## LONG-FORM VIDEO OVERRIDE

This is a LONG-FORM YouTube video, NOT a Short. Apply these rules instead of the short-form pacing table:

- **Scene count**: exactly ${sceneCount} scenes total (capped for output reliability)
- **Words per scene**: ${wordsPerScene - 10}-${wordsPerScene + 10} words (detailed narration, one focused idea per scene)
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

function buildVisualTypesInstruction(allowedVisualTypes?: string[], videoEnabled?: boolean): { visualTypes: string; videoGuidance: string } {
  // Derive allowed set: explicit list wins, else fall back to videoEnabled flag
  const allowed = allowedVisualTypes && allowedVisualTypes.length > 0
    ? allowedVisualTypes
    : videoEnabled
      ? ["ai_image", "stock_image", "stock_video", "text_card", "ai_video"]
      : ["ai_image", "stock_image", "stock_video", "text_card"];

  const hasVideo = allowed.includes("ai_video");
  const visualTypes = `ONLY these visual types: ${allowed.join(", ")}. Do NOT use any other type.`;
  const videoGuidance = hasVideo
    ? "\nai_video: Use for 1-3 scenes where MOTION is the story. ai_video costs ~$0.30/scene vs ~$0.04 for ai_image. Use selectively. Set motion to 'static' for ai_video scenes."
    : "";
  return { visualTypes, videoGuidance };
}

export async function generateDirectorScore(
  llm: LLMProvider,
  topic: string,
  researchContext: ResearchResult,
  options?: { archetype?: string; pacing?: string; videoEnabled?: boolean; allowedVisualTypes?: string[]; direction?: string; targetDurationMinutes?: number },
): Promise<DirectorScoreOutput> {
  const systemPrompt = loadDirectorSystemPrompt(options?.targetDurationMinutes);

  const archetypes = listArchetypes();
  const archetypeInstruction = options?.archetype
    ? `Use the "${options.archetype}" archetype.`
    : `Choose from: ${archetypes.join(", ")}`;

  const { visualTypes, videoGuidance } = buildVisualTypesInstruction(options?.allowedVisualTypes, options?.videoEnabled);

  // Resolve pacing tier: explicit --pacing override > archetype default > lookup table
  const pacingInstruction = buildPacingInstruction(options?.archetype, options?.pacing, options?.targetDurationMinutes);

  const directionSection = options?.direction?.trim()
    ? `\n## Creative Direction (from the producer)\n\n${options.direction}\n\nHonor these creative constraints while exercising your judgment on anything not specified.\n`
    : "";

  const isLongForm = (options?.targetDurationMinutes ?? 0) >= 5;
  const wordsTarget = isLongForm ? Math.round((options!.targetDurationMinutes!) * 150) : null;
  const MAX_SCENES = 30;
  const sceneTarget = isLongForm ? Math.min(Math.round(wordsTarget! / 45), MAX_SCENES) : null;
  const wordsPerSceneTarget = isLongForm ? Math.round(wordsTarget! / sceneTarget!) : null;

  const userMessage = `Topic: ${topic}

Research context:
${researchContext.summary}

Key facts:
${researchContext.key_facts.map((f) => `- ${f}`).join("\n")}

Mood: ${researchContext.mood}

${archetypeInstruction}

${pacingInstruction}
Use ${visualTypes}.${videoGuidance}
${directionSection}CRITICAL RULE: Never use the same visual_type more than 2 times in a row. With more scenes, plan your visual_type sequence BEFORE writing scenes to ensure variety.
Every scene MUST have a script_line (the voiceover text).
The first scene should be a strong hook.
${isLongForm
  ? `MANDATORY: This is a ${options!.targetDurationMinutes!}-minute video. Generate exactly ${sceneTarget} scenes with ~${wordsPerSceneTarget} words each. Total word count MUST be ~${wordsTarget} words. Break topic into chapters separated by text_card chapter titles. Stop at exactly ${sceneTarget} scenes.`
  : "If over budget, cut a scene rather than cramming."
}`;

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

      // Auto-repair golden rule violations before strict validation.
      // When only one visual type is allowed, repair is skipped and the
      // golden rule refinement is bypassed (it can't be satisfied).
      const allowedTypes = options?.allowedVisualTypes ?? [];
      repairGoldenRule(result.data.scenes, allowedTypes);

      const validated = isSingleVisualTypeMode(allowedTypes)
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
  fast: { min: 8, max: 12, wordsPerScene: "18-25", totalWords: "210-270" },
  moderate: { min: 7, max: 10, wordsPerScene: "24-32", totalWords: "215-285" },
  cinematic: { min: 5, max: 8, wordsPerScene: "30-42", totalWords: "215-290" },
};

const PACING_TIER_TABLE = `After choosing your archetype, use the matching pacing tier from this table:
- fast (8-12 scenes, 18-25 words/scene, 210-270 words total): infographic, bold_illustration, comic_book
- moderate (7-10 scenes, 24-32 words/scene, 215-285 words total): warm_editorial, editorial_caricature, anime_illustration, vintage_snapshot, surreal_dreamscape, gothic_fantasy
- cinematic (5-8 scenes, 30-42 words/scene, 215-290 words total): cinematic_documentary, moody_cinematic, studio_realism, warm_narrative, pastoral_watercolor`;

export function buildPacingInstruction(archetype?: string, pacingOverride?: string, targetDurationMinutes?: number): string {
  // Path 0: Long-form YouTube horizontal — calculate scenes from target duration
  if (targetDurationMinutes && targetDurationMinutes >= 5) {
    const wordsTarget = Math.round(targetDurationMinutes * 150);
    // Cap scenes at 30 to keep the JSON response within LLM output token limits.
    // Fewer scenes with more words each is also better pacing for long-form content.
    const MAX_SCENES = 30;
    const sceneCount = Math.min(Math.round(wordsTarget / 45), MAX_SCENES);
    const wordsPerScene = Math.round(wordsTarget / sceneCount);
    console.log(`[creative-director] Long-form pacing: ~${sceneCount} scenes for ${targetDurationMinutes} min (~${wordsTarget} words, ~${wordsPerScene} words/scene)`);
    return `This is a LONG-FORM YouTube video targeting ${targetDurationMinutes} minutes.
Create a DirectorScore with exactly ${sceneCount} scenes.
Per-scene word budget: ${wordsPerScene - 10}-${wordsPerScene + 10} words (detailed narration, one focused idea per scene).
Total word budget: approximately ${wordsTarget} words at ~150 words/minute.
Structure: engaging intro (2-3 scenes), multiple topic chapters of 5-8 scenes each, strong conclusion with CTA (2-3 scenes).
Each chapter must have a clear thematic focus. Vary visual types throughout.`;
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

// When VIVI (or any LLM) violates the golden rule (3+ consecutive same visual_type),
// auto-fix by rotating the offending scene to a different allowed type.
// Skipped entirely when only one visual type is allowed.
function repairGoldenRule(
  scenes: Array<{ visual_type: string; [key: string]: unknown }>,
  allowedTypes: string[],
): void {
  if (isSingleVisualTypeMode(allowedTypes)) return;

  const fallbackOrder = ["ai_image", "stock_image", "stock_video", "text_card", "ai_video"];
  const pool = allowedTypes.length > 0 ? allowedTypes : fallbackOrder;

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
  options?: { archetype?: string; pacing?: string; videoEnabled?: boolean; allowedVisualTypes?: string[]; direction?: string; targetDurationMinutes?: number },
): Promise<DirectorScoreOutput> {
  const systemPrompt = loadDirectorSystemPrompt(options?.targetDurationMinutes);

  // Build revision instructions from critique, guarding nullable revision_instructions
  const revisionGuidance = critique.revision_instructions
    ?? `Address these weaknesses: ${critique.weaknesses.join("; ")}`;

  const pacingInstruction = buildPacingInstruction(options?.archetype, options?.pacing, options?.targetDurationMinutes);

  const { visualTypes } = buildVisualTypesInstruction(options?.allowedVisualTypes, options?.videoEnabled);

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
Use ${visualTypes}.
${directionSection}
## Current Plan (score: ${critique.score}/10)

${JSON.stringify(originalScore, null, 2)}

## Critic Feedback

Strengths: ${critique.strengths.join(", ")}
Weaknesses: ${critique.weaknesses.join(", ")}
${critique.weakest_scene_index != null ? `Weakest scene: Scene ${critique.weakest_scene_index}` : ""}

## Revision Instructions

${revisionGuidance}

Revise the DirectorScore to address the weaknesses while preserving the strengths.
Keep the same archetype. Maintain the GOLDEN RULE: never use the same visual_type more than 2 times in a row.`;

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
      repairGoldenRule(result.data.scenes, allowedTypesRev);

      const validated = isSingleVisualTypeMode(allowedTypesRev)
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
