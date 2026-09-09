import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { PACING_CONFIG } from "./creative-director.js";
import {
  applyAuditToCritique,
  auditDirectorScore,
  formatPacingForCritic,
  type CriticEvalOptions,
} from "./critic-audit.js";
import { getArchetype } from "../config/archetype-registry.js";
import { loadPlaybookSections } from "../config/playbook.js";
import type { DirectorScore } from "../schema/director-score.js";
import type { ScenePacing } from "../schema/archetype.js";
import type { LLMProvider, LLMUsage } from "../schema/providers.js";

export type { CriticEvalOptions } from "./critic-audit.js";

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), "prompts", "critic.md");

const CritiqueResult = z.object({
  score: z.number(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  revision_needed: z.boolean(),
  revision_instructions: z.string().nullable(),
  weakest_scene_index: z.number().nullable(),
});
export type CritiqueResult = z.infer<typeof CritiqueResult> & { findings?: string[] };

export interface CritiqueOutput {
  data: CritiqueResult;
  usage: LLMUsage;
}

function normalizeOptions(pacingOrOptions?: string | CriticEvalOptions): CriticEvalOptions {
  if (pacingOrOptions == null) return {};
  if (typeof pacingOrOptions === "string") return { pacing: pacingOrOptions };
  return pacingOrOptions;
}

export async function evaluate(
  llm: LLMProvider,
  score: DirectorScore,
  topic: string,
  pacingOrOptions?: string | CriticEvalOptions,
): Promise<CritiqueOutput> {
  const opts = normalizeOptions(pacingOrOptions);
  const audit = auditDirectorScore(score, opts);

  let systemPrompt =
    "You are a video quality critic. Evaluate the DirectorScore for hook strength, visual variety, pacing, script quality, identity lock, and overall coherence. Score 1-10.";

  try {
    systemPrompt = fs.readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  } catch {
    // Use default
  }

  try {
    const rubric = loadPlaybookSections(["Pacing Rules", "Critic Rubric"]);
    systemPrompt += "\n\n" + rubric;
  } catch (err) {
    console.warn(`[critic] Playbook rubric not loaded: ${err}`);
  }

  let pacingTier: ScenePacing = "moderate";
  if (opts.pacing && opts.pacing in PACING_CONFIG) {
    pacingTier = opts.pacing as ScenePacing;
  } else {
    try {
      pacingTier = getArchetype(score.archetype).scenePacing;
    } catch {
      // Unknown archetype — default to moderate
    }
  }

  const PACING_RANGES = Object.fromEntries(
    Object.entries(PACING_CONFIG).map(([tier, cfg]) => [
      tier,
      `${cfg.min}-${cfg.max} scenes, ${cfg.wordsPerScene} words per scene, ${cfg.totalWords} total words`,
    ]),
  ) as Record<ScenePacing, string>;

  const auditBlock = audit.findings.length
    ? `\n\nDeterministic audit (these are facts; do not contradict them):\n${audit.findings.map((f) => `- ${f}`).join("\n")}`
    : "";

  const lockBlock = opts.characterLock?.trim()
    ? `\n\nCharacter identity lock (must hold in EVERY AI prompt):\n${opts.characterLock.trim()}`
    : "";

  const userMessage = `Topic: ${topic}

${formatPacingForCritic(score, opts, pacingTier, PACING_RANGES[pacingTier])}
${lockBlock}
${auditBlock}

DirectorScore:
${JSON.stringify(score, null, 2)}

Evaluate this video plan. Score it 1-10. If revision is needed, give concrete visual/identity fixes. If the script is locked, do not ask to rewrite narration.`;

  const result = await llm.generate({
    systemPrompt,
    userMessage,
    schema: CritiqueResult,
  });
  return { data: applyAuditToCritique(result.data, audit), usage: result.usage };
}
