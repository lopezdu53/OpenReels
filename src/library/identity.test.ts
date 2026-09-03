import { describe, expect, it } from "vitest";
import { applyVisualIdentity, formatCharacterLock } from "./identity.js";
import type { DirectorScore } from "../schema/director-score.js";

function score(over: Partial<DirectorScore> = {}): DirectorScore {
  return {
    emotional_arc: "curiosity-to-gratitude",
    archetype: "warm_narrative",
    music_mood: "warm_acoustic",
    scenes: [
      { visual_type: "ai_image", visual_prompt: "A cub in the jungle", motion: "static", script_line: "Había un tigrillo.", transition: "none" },
      { visual_type: "ai_video", visual_prompt: "The cub runs", motion: "static", script_line: "Corrió sin miedo.", transition: null },
      { visual_type: "ai_image", visual_prompt: "Mother comforts the cub", motion: "zoom_out", script_line: "Su mamá lo abrazó.", transition: "wipe" },
    ],
    ...over,
  };
}

describe("visual identity lock", () => {
  it("formats species lock text", () => {
    const text = formatCharacterLock({
      name: "Rayitas",
      kind: "animal",
      species: "ocelot cub (Leopardus pardalis), NOT a Bengal tiger",
      appearance: "pale yellowish coat with small dark rosettes, round ears, cub proportions",
    });
    expect(text).toContain("Rayitas");
    expect(text).toContain("Kind: animal");
    expect(text).toContain("NOT a Bengal tiger");
    expect(text).toContain("rosettes");
  });

  it("prefixes AI prompts and never leaves still↔motion as a hard cut", () => {
    const next = applyVisualIdentity(score(), "Rayitas the ocelot cub, not a Bengal tiger");
    expect(next.scenes[0]!.visual_prompt).toContain("IDENTITY LOCK");
    expect(next.scenes[0]!.visual_prompt).toContain("ocelot");
    expect(next.scenes[0]!.motion).toBe("zoom_in");
    expect(next.scenes[0]!.transition).toBe("crossfade");
    expect(next.scenes[1]!.transition).toBe("crossfade");
    expect(next.scenes[2]!.visual_prompt).toContain("IDENTITY LOCK");
  });
});
