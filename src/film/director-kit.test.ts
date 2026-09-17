import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILM_LOOK,
  FILM_ARCS,
  FILM_LOOKS,
  filmArcHint,
  filmDensityRecipe,
  filmDirectorKitSection,
  filmLookArchetype,
  filmLookPrompt,
  filmScriptKitBrief,
  isFilmArcId,
  isFilmLookId,
  recommendFilmArc,
} from "./director-kit.js";

describe("film kinetic director kit", () => {
  it("ships non-stickman looks with prompt locks", () => {
    expect(FILM_LOOKS.map((look) => look.id)).toEqual([
      "3d-toon",
      "clay",
      "anime",
      "documentary",
      "noir",
      "isometric",
      "paper-craft",
    ]);
    expect(isFilmLookId(DEFAULT_FILM_LOOK)).toBe(true);
    expect(filmLookPrompt()).toBe("");
    expect(filmLookPrompt("classic")).toBe("");
    expect(filmLookPrompt("clay")).toMatch(/claymation/i);
    expect(filmLookPrompt("clay")).toMatch(/no stick figures/i);
    expect(filmLookArchetype("anime")).toBe("anime_illustration");
    expect(filmLookArchetype("noir")).toBe("moody_cinematic");
    expect(isFilmLookId("classic")).toBe(false);
  });

  it("ports narrative arcs without stick-figure wording", () => {
    expect(FILM_ARCS.every((arc) => arc.hint.length > 20)).toBe(true);
    expect(isFilmArcId("how_it_works")).toBe(true);
    expect(filmArcHint("vs_debate")).toMatch(/posturas|A, la otra B/i);
    expect(filmArcHint("vs_debate").toLowerCase()).not.toContain("palito");
    expect(recommendFilmArc("Bitcoin vs el negocio tradicional")).toBe("vs_debate");
    expect(recommendFilmArc("cómo funciona el wifi")).toBe("how_it_works");
    expect(recommendFilmArc("un chiste de oficina")).toBe("joke_punchline");
  });

  it("asks hero clips to morph the world, not the face", () => {
    const density = filmDensityRecipe(true);
    expect(density).toMatch(/FOLLOW-CAM/);
    expect(density).toMatch(/Do NOT morph the hero's face/i);
    expect(density.toLowerCase()).toContain("never stick figures");
    const kit = filmDirectorKitSection({
      lookId: "clay",
      narrativeArc: "origin",
      castMode: "hero",
    });
    expect(kit).toContain("KINETIC DIRECTOR KIT");
    expect(kit).toContain("LOOK LOCK");
    expect(kit).toContain("NARRATIVE ARC");
    expect(kit).toContain("claymation");
    expect(kit).toContain("not Stickman");
    expect(kit).toContain("Never become a stick-figure short");
    expect(filmDirectorKitSection({})).toBe("");
    expect(filmScriptKitBrief("anime", "listicle")).toMatch(/Anime/);
    expect(filmScriptKitBrief("anime", "listicle")).toMatch(/Lista/);
    expect(filmScriptKitBrief()).toBe("");
  });
});
