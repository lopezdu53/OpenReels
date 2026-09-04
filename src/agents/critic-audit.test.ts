import { describe, expect, it } from "vitest";
import type { DirectorScore } from "../schema/director-score.js";
import {
  applyAuditToCritique,
  auditDirectorScore,
  extractLockTokens,
  formatPacingForCritic,
  summarizeVideoFallbacks,
} from "./critic-audit.js";

const lock =
  "Name: rayitas 2. Kind: animal. Species/race (LOCKED): gato persa. Age: bebe. Appearance: Gato realista blanco de gran pelaje con rayas doradas, ojos azules";

function filmScore(): DirectorScore {
  const line = "Rayitas era un gatito hermoso con rayas naranjas y blancas, pero tenía un gran problema.";
  return {
    emotional_arc: "playful-to-wisdom",
    archetype: "warm_narrative",
    music_mood: "warm_acoustic",
    scenes: Array.from({ length: 8 }, (_, i) => ({
      visual_type: i === 2 ? ("ai_video" as const) : ("ai_image" as const),
      visual_prompt:
        i === 0
          ? "A cute orange tabby kitten in a living room"
          : `IDENTITY LOCK gato persa blanco ojos azules. Scene ${i}`,
      motion: "zoom_in" as const,
      script_line: line,
      transition: "crossfade" as const,
    })),
  };
}

describe("critic audit", () => {
  it("does not treat a locked Film script as a short-form word-budget fail", () => {
    const audit = auditDirectorScore(filmScore(), {
      pacing: "cinematic",
      platform: "youtube_horizontal",
      direction: "## Guion (locución)\n" + "palabra ".repeat(80),
      characterLock: lock,
    });
    expect(audit.mode).toBe("locked-script");
    expect(audit.findings.some((f) => /210-265|presupuesto/.test(f))).toBe(false);
    expect(audit.findings.some((f) => /fotogramas/.test(f))).toBe(true);
    expect(formatPacingForCritic(filmScore(), {
      pacing: "cinematic",
      platform: "youtube_horizontal",
      direction: "## Guion\ntexto",
    }, "cinematic", "10-14 scenes")).toContain("LOCKED producer script");
  });

  it("flags missing species tokens, consecutive images, and humans", () => {
    const score: DirectorScore = {
      emotional_arc: "arc",
      archetype: "warm_narrative",
      music_mood: "warm_acoustic",
      scenes: [
        { visual_type: "ai_image", visual_prompt: "a little boy by the river", motion: "zoom_in", script_line: "Hola.", transition: "crossfade" },
        { visual_type: "ai_image", visual_prompt: "more photos", motion: "zoom_in", script_line: "Sigue.", transition: "crossfade" },
        { visual_type: "ai_image", visual_prompt: "still photos", motion: "zoom_in", script_line: "Fin.", transition: "crossfade" },
      ],
    };
    const audit = auditDirectorScore(score, { characterLock: lock, platform: "youtube_horizontal" });
    expect(audit.maxConsecutiveSameType).toBe(3);
    expect(audit.revisionNeeded).toBe(true);
    expect(audit.findings.some((f) => /humano/i.test(f))).toBe(true);
    expect(audit.findings.some((f) => /especie|marcas/i.test(f))).toBe(true);
    expect(audit.findings.some((f) => /16:9/.test(f))).toBe(true);
    expect(audit.maxScore).toBeLessThanOrEqual(6);
  });

  it("clamps a glowing LLM score when identity drifted in the plan", () => {
    const score: DirectorScore = {
      emotional_arc: "arc",
      archetype: "warm_narrative",
      music_mood: "warm_acoustic",
      scenes: [
        { visual_type: "ai_image", visual_prompt: "niño humano en la selva", motion: "zoom_in", script_line: "Había un tigrillo.", transition: "crossfade" },
        { visual_type: "text_card", visual_prompt: "Title", motion: "static", script_line: "Fin.", transition: null },
        { visual_type: "ai_image", visual_prompt: "another boy", motion: "zoom_out", script_line: "Cierre.", transition: null },
      ],
    };
    const audit = auditDirectorScore(score, {
      characterLock: "Kind: animal. Species/race (LOCKED): tigrillo ocelote. Appearance: ocelos dorados",
    });
    const next = applyAuditToCritique(
      {
        score: 9,
        strengths: ["identity locked perfectly"],
        weaknesses: [],
        revision_needed: false,
        revision_instructions: null,
      },
      audit,
    );
    expect(next.score).toBeLessThanOrEqual(6);
    expect(next.revision_needed).toBe(true);
    expect(next.revision_instructions).toMatch(/script_line|especie|humano|tigrillo/i);
  });

  it("does not treat MUST-avoid 'niño humano' in the lock prefix as a human hero", () => {
    const score: DirectorScore = {
      emotional_arc: "arc",
      archetype: "warm_narrative",
      music_mood: "warm_acoustic",
      scenes: [
        {
          visual_type: "ai_image",
          visual_prompt:
            "IDENTITY LOCK: Kind: animal. Species/race (LOCKED): coatí. MUST avoid: niño humano, mapache. SCENE: Coco the ring-tailed coati cub under the trees, 16:9 landscape",
          motion: "zoom_in",
          script_line: "Coco el coatí se perdió.",
          transition: "crossfade",
        },
        { visual_type: "text_card", visual_prompt: "PERDIDO", motion: "static", script_line: "Mamá.", transition: null },
        {
          visual_type: "ai_image",
          visual_prompt:
            "IDENTITY LOCK: Kind: animal. MUST avoid: niño humano. SCENE: mother coati finds Coco, ringed tail, 16:9",
          motion: "zoom_out",
          script_line: "Mamá coatí llegó.",
          transition: null,
        },
      ],
    };
    const audit = auditDirectorScore(score, {
      characterLock: "Kind: animal. Species/race (LOCKED): coatí. Appearance: cola anillada. MUST avoid: niño humano",
    });
    expect(audit.findings.some((f) => /mete un humano/.test(f))).toBe(false);
  });

  it("collects species tokens from every CAST member", () => {
    const { species, tokens } = extractLockTokens(
      "CAST of 2. [1] Name: Coco. Kind: animal. Species/race (LOCKED): coatí. Appearance: cola anillada. [2] Name: Tambo. Kind: animal. Species/race (LOCKED): gallito de las rocas. Appearance: cresta disco naranja",
    );
    expect(species.toLowerCase()).toContain("coatí");
    expect(species.toLowerCase()).toContain("gallito");
    expect(tokens).toEqual(expect.arrayContaining(["coatí", "gallito", "rocas", "anillada", "cresta"]));
  });

  it("asks Film scores for shot_type variety", () => {
    const score: DirectorScore = {
      emotional_arc: "arc",
      archetype: "cinematic_documentary",
      music_mood: "warm_acoustic",
      scenes: [
        { visual_type: "ai_image", visual_prompt: "16:9 landscape Coco coatí", motion: "zoom_in", script_line: "Uno.", transition: "crossfade" },
        { visual_type: "ai_image", visual_prompt: "16:9 landscape Coco coatí", motion: "zoom_in", script_line: "Dos.", transition: "crossfade" },
        { visual_type: "text_card", visual_prompt: "CAP", motion: "static", script_line: "Tres.", transition: null },
        { visual_type: "ai_image", visual_prompt: "16:9 landscape Coco coatí", motion: "zoom_out", script_line: "Cuatro.", transition: null },
        { visual_type: "ai_image", visual_prompt: "16:9 landscape Coco coatí", motion: "pan_left", script_line: "Cinco.", transition: null },
      ],
    };
    const audit = auditDirectorScore(score, { platform: "youtube_horizontal" });
    expect(audit.findings.some((f) => /shot_type/i.test(f))).toBe(true);
  });

  it("summarizes Gemini credit exhaustion as a production note", () => {
    const notes = summarizeVideoFallbacks([
      {
        method: "image_fallback",
        provider: "none",
        error: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"Your prepayment credits are depleted."}}',
      },
    ]);
    expect(notes[0]).toMatch(/créditos|429/i);
  });
});
