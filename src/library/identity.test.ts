import { describe, expect, it } from "vitest";
import { applyVisualIdentity, countLockedCharacters, formatCastLock, formatCharacterLock, identityLockLead } from "./identity.js";
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

  it("includes aliases so script nicknames map to the same individual", () => {
    const text = formatCharacterLock({
      name: "Coco",
      kind: "animal",
      species: "coatí",
      appearance: "cola anillada",
      aliases: "el coatí, Coco el Coatí",
    });
    expect(text).toContain("Aliases (same individual): el coatí, Coco el Coatí");
  });

  it("formats a 2–3 character CAST without merging identities", () => {
    const text = formatCastLock([
      { name: "Coco", kind: "animal", species: "coatí", appearance: "cola anillada" },
      { name: "Tambo", kind: "animal", species: "gallito de las rocas", appearance: "cresta disco naranja" },
      { name: "Luz", kind: "human", species: "humano", appearance: "pelo corto" },
    ]);
    expect(text).toContain("CAST of 3");
    expect(text).toContain("[1] Name: Coco");
    expect(text).toContain("[2] Name: Tambo");
    expect(text).toContain("[3] Name: Luz");
    expect(countLockedCharacters(text)).toBe(3);
    expect(identityLockLead(text)).toContain("named CAST of 3");
  });

  it("caps CAST formatting at 3 characters", () => {
    const extra = {
      name: "Cuatro",
      kind: "animal" as const,
      species: "zorro",
      appearance: "naranja",
    };
    const text = formatCastLock([
      { name: "Uno", kind: "animal", species: "coatí", appearance: "a" },
      { name: "Dos", kind: "animal", species: "tucán", appearance: "b" },
      { name: "Tres", kind: "animal", species: "rana", appearance: "c" },
      extra,
    ]);
    expect(countLockedCharacters(text)).toBe(3);
    expect(text).not.toContain("Cuatro");
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
