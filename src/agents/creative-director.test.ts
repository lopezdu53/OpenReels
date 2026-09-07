import { describe, expect, it, vi } from "vitest";
import { buildPacingInstruction, PACING_CONFIG, remapDisallowedVisualTypes, repairGoldenRule, reviseDirectorScore } from "./creative-director.js";
import type { DirectorScore } from "../schema/director-score.js";
import type { LLMProvider } from "../schema/providers.js";
import type { CritiqueResult } from "./critic.js";
import type { ResearchResult } from "./research.js";

describe("buildPacingInstruction", () => {
  // Path 2: explicit archetype — derive tier from config
  it("returns single tier instruction for known archetype (fast)", () => {
    const result = buildPacingInstruction("infographic");
    expect(result).toContain("fast");
    expect(result).toContain("16-22");
    expect(result).not.toContain("After choosing your archetype");
  });

  it("returns single tier instruction for known archetype (moderate)", () => {
    const result = buildPacingInstruction("editorial_caricature");
    expect(result).toContain("moderate");
    expect(result).toContain("14-18");
  });

  it("returns single tier instruction for known archetype (cinematic)", () => {
    const result = buildPacingInstruction("cinematic_documentary");
    expect(result).toContain("cinematic");
    expect(result).toContain("10-14");
  });

  // Path 3: no archetype — full tier lookup table
  it("returns full tier lookup table when no archetype specified", () => {
    const result = buildPacingInstruction();
    expect(result).toContain("After choosing your archetype");
    expect(result).toContain("infographic");
    expect(result).toContain("cinematic_documentary");
    expect(result).toContain("warm_editorial");
    // All three tiers present
    expect(result).toContain("fast");
    expect(result).toContain("moderate");
    expect(result).toContain("cinematic");
  });

  it("returns full tier lookup table for unknown archetype", () => {
    const result = buildPacingInstruction("nonexistent_archetype");
    expect(result).toContain("After choosing your archetype");
  });

  // Path 1: --pacing override wins
  it("uses explicit pacing override regardless of archetype", () => {
    const result = buildPacingInstruction("cinematic_documentary", "fast");
    expect(result).toContain("fast");
    expect(result).toContain("16-22");
    expect(result).not.toContain("cinematic");
  });

  it("uses explicit pacing override without archetype", () => {
    const result = buildPacingInstruction(undefined, "cinematic");
    expect(result).toContain("cinematic");
    expect(result).toContain("10-14");
    expect(result).not.toContain("After choosing your archetype");
  });

  it("ignores invalid pacing override and falls through", () => {
    const result = buildPacingInstruction("infographic", "turbo");
    // Invalid pacing is not in PACING_CONFIG, so falls through to archetype
    expect(result).toContain("fast");
    expect(result).toContain("16-22");
  });

  // Word budget inclusion
  it("includes word budget in tier instruction", () => {
    const result = buildPacingInstruction("infographic");
    expect(result).toContain("210-260");
    expect(result).toContain("10-14 words");
  });

  it("includes word budget for moderate tier", () => {
    const result = buildPacingInstruction("warm_editorial");
    expect(result).toContain("210-260");
    expect(result).toContain("12-16");
  });

  it("uses a 15-second test plan for Film", () => {
    const result = buildPacingInstruction("cinematic_documentary", undefined, 0.25, "youtube_horizontal");
    expect(result).toContain("15-SECOND TEST");
    expect(result).toContain("exactly 3 scenes");
    expect(result).toContain("NO text_card");
    expect(result).not.toContain("chapter");
  });

  it("uses a 30-second test plan for Film", () => {
    const result = buildPacingInstruction("cinematic_documentary", undefined, 0.5, "youtube_horizontal");
    expect(result).toContain("30-SECOND TEST");
    expect(result).toContain("exactly 6 scenes");
    expect(result).toContain("NO text_card");
    expect(result).not.toContain("chapter");
  });

  it("uses a 1-minute plan without title cards for Film", () => {
    const result = buildPacingInstruction("cinematic_documentary", undefined, 1, "youtube_horizontal");
    expect(result).toContain("targeting 1 minutes");
    expect(result).toContain("exactly 15 scenes");
    expect(result).toContain("NO text_card");
    expect(result).toContain("cliffhanger");
  });

  it("bans text_card on 8-minute YouTube horizontal Film", () => {
    const result = buildPacingInstruction("cinematic_documentary", undefined, 8, "youtube_horizontal");
    expect(result).toContain("NO text_card");
    expect(result).not.toContain("use a text_card as a chapter");
  });
});

describe("PACING_CONFIG", () => {
  it("has valid config for all three tiers", () => {
    expect(PACING_CONFIG.fast).toBeDefined();
    expect(PACING_CONFIG.moderate).toBeDefined();
    expect(PACING_CONFIG.cinematic).toBeDefined();
  });

  it("fast tier has fewer max scenes than schema allows", () => {
    expect(PACING_CONFIG.fast.max).toBeLessThanOrEqual(200);
    expect(PACING_CONFIG.fast.min).toBeGreaterThanOrEqual(3);
  });

  it("word budget math closes for fast tier typical case", () => {
    // Typical fast tier: hook(10) + N middle scenes at avg words + CTA(10)
    // With 10 scenes (typical): 10 + 8*10 + 10 = 100 words — within 90-120 budget
    const middleScenes = PACING_CONFIG.fast.max - 2; // minus hook + CTA
    const avgWordsPerScene = 10; // middle of 8-12 range
    const hookCta = 20; // 10 words each
    const totalBudgetMax = parseInt(PACING_CONFIG.fast.totalWords.split("-")[1]!);
    expect(middleScenes * avgWordsPerScene + hookCta).toBeLessThanOrEqual(totalBudgetMax);
  });

  it("cinematic tier has lower scene count than fast", () => {
    expect(PACING_CONFIG.cinematic.max).toBeLessThan(PACING_CONFIG.fast.max);
  });
});

// ── reviseDirectorScore tests ────────────────────────────────────────────────

const baseScore: DirectorScore = {
  emotional_arc: "curiosity-to-wisdom",
  archetype: "infographic",
  music_mood: "epic_cinematic",
  scenes: [
    { visual_type: "text_card", visual_prompt: "Title", motion: "static", script_line: "Did you know this?", transition: null },
    { visual_type: "ai_image", visual_prompt: "A diagram", motion: "zoom_in", script_line: "Here is the truth.", transition: "crossfade" },
    { visual_type: "stock_video", visual_prompt: "Ocean", motion: "static", script_line: "It changed everything.", transition: "slide_left" },
    { visual_type: "ai_image", visual_prompt: "Chart", motion: "pan_right", script_line: "The numbers prove it.", transition: "crossfade" },
    { visual_type: "stock_image", visual_prompt: "Sunset", motion: "zoom_out", script_line: "Think about that.", transition: "crossfade" },
    { visual_type: "text_card", visual_prompt: "CTA", motion: "static", script_line: "What do you think?", transition: "wipe" },
    { visual_type: "ai_image", visual_prompt: "Finale", motion: "zoom_in", script_line: "Comment below!", transition: null },
    { visual_type: "stock_video", visual_prompt: "Stars", motion: "static", script_line: "Follow for more.", transition: "crossfade" },
  ],
};

const baseResearch: ResearchResult = {
  summary: "Test topic summary",
  key_facts: ["fact1", "fact2"],
  mood: "informative",
  sources: [],
};

const baseCritique: CritiqueResult = {
  score: 5,
  strengths: ["good hook"],
  weaknesses: ["weak pacing", "repetitive visuals"],
  revision_needed: true,
  revision_instructions: "Improve pacing in scenes 3-5 and add more visual variety.",
  weakest_scene_index: 3,
};

function mockRevisionLLM(): LLMProvider & { lastUserMessage: string } {
  const mock = {
    id: "anthropic" as const,
    lastUserMessage: "",
    generate: vi.fn(async ({ userMessage }: { userMessage: string }) => {
      mock.lastUserMessage = userMessage;
      return {
        data: { ...baseScore },
        usage: { inputTokens: 200, outputTokens: 100 },
      };
    }),
  };
  return mock as unknown as LLMProvider & { lastUserMessage: string };
}

describe("reviseDirectorScore", () => {
  it("generates a revised DirectorScore from critique feedback", async () => {
    const llm = mockRevisionLLM();
    const result = await reviseDirectorScore(llm, "test topic", baseResearch, baseScore, baseCritique);
    expect(result.data.archetype).toBe("infographic");
    expect(result.data.scenes.length).toBeGreaterThanOrEqual(3);
    expect(result.usage.inputTokens).toBe(200);
  });

  it("includes critique details in the user message", async () => {
    const llm = mockRevisionLLM();
    await reviseDirectorScore(llm, "test topic", baseResearch, baseScore, baseCritique);
    expect(llm.lastUserMessage).toContain("score: 5/10");
    expect(llm.lastUserMessage).toContain("weak pacing");
    expect(llm.lastUserMessage).toContain("Improve pacing in scenes 3-5");
    expect(llm.lastUserMessage).toContain("Weakest scene: Scene 3");
  });

  it("falls back to weaknesses when revision_instructions is null", async () => {
    const llm = mockRevisionLLM();
    const critique: CritiqueResult = {
      ...baseCritique,
      revision_instructions: null,
    };
    await reviseDirectorScore(llm, "test topic", baseResearch, baseScore, critique);
    expect(llm.lastUserMessage).toContain("weak pacing; repetitive visuals");
  });
});

describe("remapDisallowedVisualTypes", () => {
  it("remaps stock types to ai_image when stock is not allowed", () => {
    const scenes = [
      { visual_type: "stock_video" },
      { visual_type: "stock_image" },
      { visual_type: "text_card" },
    ];
    remapDisallowedVisualTypes(scenes, ["ai_image", "text_card"]);
    expect(scenes[0]!.visual_type).toBe("ai_image");
    expect(scenes[1]!.visual_type).toBe("ai_image");
    expect(scenes[2]!.visual_type).toBe("text_card");
  });

  it("is a no-op when allowedTypes is empty", () => {
    const scenes = [{ visual_type: "stock_video" }];
    remapDisallowedVisualTypes(scenes, []);
    expect(scenes[0]!.visual_type).toBe("stock_video");
  });
});

describe("repairGoldenRule", () => {
  it("does not repair to stock types when they are not allowed", () => {
    const scenes = [
      { visual_type: "ai_image" },
      { visual_type: "ai_image" },
      { visual_type: "ai_image" },
    ];
    repairGoldenRule(scenes, ["ai_image", "text_card", "ai_video"]);
    expect(scenes[2]!.visual_type).toBe("text_card");
    expect(scenes[2]!.visual_type).not.toBe("stock_image");
    expect(scenes[2]!.visual_type).not.toBe("stock_video");
  });

  it("skips repair in follow-cam hero so every clip can stay ai_video", () => {
    const scenes = [
      { visual_type: "ai_video" },
      { visual_type: "ai_video" },
      { visual_type: "ai_video" },
    ];
    repairGoldenRule(scenes, ["ai_image", "ai_video"], true);
    expect(scenes.map((s) => s.visual_type)).toEqual(["ai_video", "ai_video", "ai_video"]);
  });

  it("skips repair when only one real visual type is allowed", () => {
    const scenes = [
      { visual_type: "ai_image" },
      { visual_type: "ai_image" },
      { visual_type: "ai_image" },
    ];
    repairGoldenRule(scenes, ["ai_image", "text_card"]);
    expect(scenes.map((s) => s.visual_type)).toEqual(["ai_image", "ai_image", "ai_image"]);
  });
});
