import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { ArchetypeConfig } from "../schema/archetype.js";
import type { LLMProvider, LLMUsage } from "../schema/providers.js";

const IMAGE_PROMPT_PATH = path.join(process.cwd(), "prompts", "image-prompter.md");
const VIDEO_PROMPT_PATH = path.join(process.cwd(), "prompts", "video-prompter.md");

const ImagePromptResult = z
  .object({
    optimized_prompt: z.string().optional(),
    prompt: z.string().optional(),
    image_prompt: z.string().optional(),
  })
  .transform((data, ctx) => {
    const text = [data.optimized_prompt, data.prompt, data.image_prompt].find((s) => s && s.trim().length > 0);
    if (!text) {
      ctx.addIssue({ code: "custom", message: "optimized_prompt is required" });
      return z.NEVER;
    }
    return { optimized_prompt: text.trim() };
  });

export interface ImagePromptOutput {
  prompt: string;
  usage: LLMUsage;
}

export interface ImagePromptOptions {
  mode?: "image" | "video";
  rejectionContext?: string;
  artStyleOverride?: string;
  characterLock?: string;
  aspectRatio?: string;
  shotType?: string;
  cameraMove?: string;
  location?: string;
  previousVisualPrompt?: string;
  shotContext?: string;
}

export async function optimizeImagePrompt(
  llm: LLMProvider,
  visualPrompt: string,
  scriptLine: string,
  sceneIndex: number,
  totalScenes: number,
  archetype: ArchetypeConfig,
  opts?: ImagePromptOptions,
): Promise<ImagePromptOutput> {
  const mode = opts?.mode ?? "image";
  const rejectionContext = opts?.rejectionContext;

  let systemPrompt =
    mode === "video"
      ? "You are a motion prompt engineer for AI video generation. Transform scene descriptions into detailed, video-generator-friendly prompts that emphasize temporal motion, camera movement, and dynamic action. Describe what MOVES, how it moves, and how the camera follows. Return the optimized prompt in the optimized_prompt field."
      : "You are a visual prompt engineer for AI image generation. Transform scene descriptions into detailed, image-generator-friendly prompts. Return the optimized prompt in the optimized_prompt field.";

  try {
    systemPrompt = fs.readFileSync(mode === "video" ? VIDEO_PROMPT_PATH : IMAGE_PROMPT_PATH, "utf-8");
  } catch {
    // Use default inline prompt above
  }

  // Inject style bible from archetype's creative fields
  const artStyle = opts?.artStyleOverride ?? archetype.artStyle;
  systemPrompt += `

## STYLE BIBLE (all scenes MUST follow this)
Art style: ${artStyle}
Color palette: ${archetype.visualColorPalette.join(", ")}
Lighting: ${archetype.lighting}
Composition: ${archetype.compositionRules}
Cultural markers: ${archetype.culturalMarkers}
Mood: ${archetype.mood}
Quality guidance: ${archetype.antiArtifactGuidance}`;

  const landscape = opts?.aspectRatio === "16:9";
  systemPrompt += `

## FRAME FORMAT
${
  landscape
    ? "WIDE 16:9 landscape widescreen (1920x1080). Compose horizontally and fill the entire frame edge to edge. Do NOT generate a vertical 9:16 or square image. Do NOT paint black bars, letterboxing, or pillarboxing into the picture."
    : "Vertical 9:16 portrait. Subject fills the frame vertically."
}`;

  if (opts?.characterLock?.trim()) {
    systemPrompt += `

## CHARACTER IDENTITY LOCK (overrides visual contrast)
The SAME individual must appear in every shot. Never change species, race, age, face, markings, or body type to create variety. Contrast only via camera angle, time of day, emotion, and framing.
Locked character: ${opts.characterLock.trim()}
If the lock says coatí / Nasua, it is NOT a fox, raccoon, cat, or tiger. Repeat the locked species in the prompt.`;
  }

  if (opts?.shotContext?.trim()) {
    systemPrompt += `

## SHOT CONTEXT (keep bible + location; change camera/action)
${opts.shotContext.trim()}`;
  } else {
    const shotBits = [
      opts?.shotType?.trim() ? `shot_type: ${opts.shotType.trim()}` : "",
      opts?.cameraMove?.trim() ? `camera_move: ${opts.cameraMove.trim()}` : "",
      opts?.location?.trim() ? `location: ${opts.location.trim()}` : "",
      opts?.previousVisualPrompt?.trim()
        ? `previous_shot: ${opts.previousVisualPrompt.trim().slice(0, 400)}`
        : "",
    ].filter(Boolean);
    if (shotBits.length) {
      systemPrompt += `

## SHOT CONTEXT (keep bible + location; change camera/action)
${shotBits.join("\n")}`;
    }
  }

  let userMessage = `Scene ${sceneIndex + 1} of ${totalScenes}
Visual description: ${visualPrompt}
Narration: ${scriptLine}`;

  if (rejectionContext) {
    userMessage += `\n\n## CONTEXT FROM STOCK SEARCH\n${rejectionContext}`;
  }

  userMessage +=
    mode === "video"
      ? `\n\nGenerate an optimized video generation prompt for this scene. Focus on motion and camera movement. Put the full text in optimized_prompt.`
      : `\n\nGenerate an optimized image generation prompt for this scene. Put the full text in the optimized_prompt field. ${landscape ? "The image MUST be 16:9 landscape, full-bleed, no letterbox bars." : "The image MUST be 9:16 portrait."}`;

  const result = await llm.generate({
    systemPrompt,
    userMessage,
    schema: ImagePromptResult,
  });

  return { prompt: result.data.optimized_prompt, usage: result.usage };
}
