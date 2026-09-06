import { describe, expect, it } from "vitest";
import { applyVisualIdentity, characterDirectionBlockForCast, countLockedCharacters, countLockedLocations, focusCastLock, focusLocationLock, focusObjectLock, formatCastLock, formatCharacterLock, formatLocationLock, formatLocationRoster, formatObjectLock, formatObjectRoster, identityLockLead, normalizeCastMode, parseCastMembers, parseLocationMembers, parseObjectMembers, planSceneCastFocus, planSceneLocationFocus, planSceneObjectFocus } from "./identity.js";
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

  it("puts only the named character on screen when the VO splits a CAST", () => {
    const lock = formatCastLock([
      { name: "Tania", kind: "human", species: "Rubia", appearance: "escote" },
      { name: "Casimiro", kind: "human", species: "hombre", appearance: "gafas" },
    ]);
    expect(parseCastMembers(lock).map((m) => m.name)).toEqual(["Tania", "Casimiro"]);

    const taniaOnly = focusCastLock(lock, parseCastMembers(lock).slice(0, 1));
    expect(taniaOnly).toContain("ON SCREEN: only Tania");
    expect(taniaOnly).toContain("Do not depict Casimiro");
    expect(taniaOnly).not.toMatch(/Name: Casimiro/);

    const film = score({
      scenes: [
        { visual_type: "ai_image", visual_prompt: "beach", motion: "static", script_line: "En una isla paradisíaca.", transition: "none" },
        { visual_type: "ai_image", visual_prompt: "CAST of 2 named individuals. [1] Name: Tania. | [2] Name: Casimiro.", motion: "zoom_in", script_line: "Tania camina descalza por la arena.", transition: "none" },
        { visual_type: "text_card", visual_prompt: "EL MILLONARIO", motion: "static", script_line: "Mientras tanto, Casimiro apenas puede creer su suerte.", transition: null },
        { visual_type: "ai_image", visual_prompt: "office", motion: "zoom_in", script_line: "Hace tres meses ganó un millón de dólares.", transition: "none" },
        { visual_type: "ai_image", visual_prompt: "pool", motion: "zoom_in", script_line: "Tania nada hasta el borde donde está Casimiro.", transition: "none" },
      ],
    });
    const focus = planSceneCastFocus(film.scenes, lock);
    expect(focus[0]!.names).toEqual([]);
    expect(focus[0]!.lock).toContain("ON SCREEN: none");
    expect(focus[1]!.names).toEqual(["Tania"]);
    expect(focus[3]!.names).toEqual(["Casimiro"]);
    expect(focus[4]!.names).toEqual(["Tania", "Casimiro"]);

    const next = applyVisualIdentity(film, lock);
    expect(next.scenes[1]!.visual_prompt).toContain("only Tania");
    expect(next.scenes[1]!.visual_prompt).toContain("Do not depict Casimiro");
    expect(next.scenes[1]!.visual_prompt).not.toMatch(/Name: Casimiro/);
    expect(next.scenes[3]!.visual_prompt).toContain("only Casimiro");
    expect(next.scenes[3]!.visual_prompt).toContain("Do not depict Tania");
    expect(next.scenes[4]!.visual_prompt).toContain("Tania and Casimiro together");
    expect(identityLockLead(focus[1]!.lock)).toMatch(/only the named ON SCREEN/i);
  });

  it("keeps the first CAST member on camera in hero mode", () => {
    expect(normalizeCastMode("hero")).toBe("hero");
    expect(normalizeCastMode("scene")).toBe("scene");
    expect(normalizeCastMode(undefined)).toBe("scene");

    const lock = formatCastLock([
      { name: "Tania", kind: "human", species: "Rubia", appearance: "escote" },
      { name: "Casimiro", kind: "human", species: "hombre", appearance: "gafas" },
    ]);
    const film = score({
      scenes: [
        { visual_type: "ai_image", visual_prompt: "beach", motion: "static", script_line: "En una isla paradisíaca.", transition: "none" },
        { visual_type: "ai_image", visual_prompt: "walk", motion: "zoom_in", script_line: "Tania camina descalza por la arena.", transition: "none" },
        { visual_type: "ai_image", visual_prompt: "office", motion: "zoom_in", script_line: "Casimiro apenas puede creer su suerte.", transition: "none" },
        { visual_type: "ai_image", visual_prompt: "pool", motion: "zoom_in", script_line: "Tania nada hasta el borde donde está Casimiro.", transition: "none" },
      ],
    });
    const focus = planSceneCastFocus(film.scenes, lock, "hero");
    expect(focus[0]!.names).toEqual(["Tania"]);
    expect(focus[0]!.lock).toContain("HERO ON CAMERA: always Tania");
    expect(focus[0]!.lock).not.toMatch(/ON SCREEN:\s*none/i);
    expect(focus[2]!.names).toEqual(["Tania", "Casimiro"]);
    expect(focus[2]!.lock).toContain("plus Casimiro");
    expect(focus[3]!.names).toEqual(["Tania", "Casimiro"]);

    const next = applyVisualIdentity(film, lock, undefined, undefined, "hero");
    expect(next.scenes[0]!.visual_prompt).toContain("HERO ON CAMERA");
    expect(next.scenes[0]!.visual_prompt).toContain("always Tania");
    expect(next.scenes[0]!.visual_prompt).toContain("FOLLOW-CAM");
    expect(next.scenes[0]!.motion).toBe("pan_left");
    expect(next.scenes[1]!.motion).toBe("pan_right");
    expect(next.scenes[0]!.transition).toBe("crossfade");
    expect(identityLockLead(focus[0]!.lock)).toMatch(/FOLLOW-CAM/i);
    expect(identityLockLead(focus[0]!.lock)).toMatch(/HERO stays in every frame/i);

    const block = characterDirectionBlockForCast(
      [
        { name: "Tania", species: "humano", appearance: "escote" },
        { name: "Casimiro", species: "humano", appearance: "gafas" },
      ],
      "hero",
    );
    expect(block).toContain("modo héroe");
    expect(block).toContain("HÉROE (siempre en cuadro)");
    expect(block).toContain("FOLLOW-CAM");
  });

  it("never combines two roster locations in one scene", () => {
    const lock = formatLocationRoster([
      { name: "Villa Santorini", place: "casa blanca de cal, terrazas, mar Egeo" },
      { name: "Oficina", place: "open space de cristal y acero, noche" },
      { name: "Selva", place: "selva húmeda, kapok, neblina" },
    ]);
    expect(countLockedLocations(lock)).toBe(3);
    expect(parseLocationMembers(lock).map((m) => m.name)).toEqual(["Villa Santorini", "Oficina", "Selva"]);

    const villaOnly = focusLocationLock(lock, parseLocationMembers(lock)[0]!);
    expect(villaOnly).toContain("ON LOCATION: only Villa Santorini");
    expect(villaOnly).toContain("Do not depict Oficina or Selva");
    expect(villaOnly).not.toMatch(/Name: Oficina/);

    const film = score({
      scenes: [
        { visual_type: "ai_image", visual_prompt: "cliff", motion: "static", script_line: "En la Villa Santorini el sol se pone.", transition: "none", location: "Villa Santorini" },
        { visual_type: "ai_image", visual_prompt: "desk", motion: "zoom_in", script_line: "Horas después, en la Oficina, el teléfono suena.", transition: "none", location: "Oficina" },
        { visual_type: "ai_image", visual_prompt: "trees", motion: "zoom_in", script_line: "Nadie habla del otro lugar.", transition: "none" },
      ],
    });
    const focus = planSceneLocationFocus(film.scenes, lock);
    expect(focus[0]!.name).toBe("Villa Santorini");
    expect(focus[1]!.name).toBe("Oficina");
    expect(focus[2]!.name).toBe("Oficina");
    expect(focus[0]!.lock).not.toMatch(/Name: Oficina/);
    expect(focus[1]!.lock).not.toMatch(/Name: Villa Santorini/);

    const next = applyVisualIdentity(film, undefined, lock);
    expect(next.scenes[0]!.visual_prompt).toContain("LOCATION LOCK");
    expect(next.scenes[0]!.visual_prompt).toContain("only Villa Santorini");
    expect(next.scenes[0]!.visual_prompt).not.toMatch(/Name: Oficina/);
    expect(next.scenes[0]!.location).toBe("Villa Santorini");
    expect(next.scenes[1]!.location).toBe("Oficina");
  });

  it("formats a single location lock", () => {
    const text = formatLocationLock({
      name: "Claro del bosque",
      place: "claro con kapok y musgo, luz filtrada",
      aliases: "el claro",
    });
    expect(text).toContain("Name: Claro del bosque");
    expect(text).toContain("Aliases (same place): el claro");
    expect(text).toContain("kapok");
  });

  it("lets named props share a frame when the line names several", () => {
    const lock = formatObjectRoster([
      { name: "Mustang", prompt: "Fastback 1967 rojo cereza", aliases: "el auto" },
      { name: "Balón", prompt: "balón de fútbol Adidas Telstar" },
      { name: "Reloj", prompt: "reloj de oro Rolex Day-Date" },
    ]);
    expect(lock).toContain("OBJECTS of 3");
    expect(lock).toMatch(/may appear together/i);
    expect(parseObjectMembers(lock).map((m) => m.name)).toEqual(["Mustang", "Balón", "Reloj"]);
    expect(formatObjectLock({ name: "Avión", prompt: "Cessna 172 blanco y azul" })).toContain("Look (LOCKED)");

    const together = focusObjectLock(lock, parseObjectMembers(lock).slice(0, 2));
    expect(together).toContain("ON PROPS: include Mustang and Balón");
    expect(together).toMatch(/MAY appear together/i);

    const film = score({
      scenes: [
        { visual_type: "ai_image", visual_prompt: "street", motion: "static", script_line: "El Mustang y el Balón esperan en la acera.", transition: "none" },
        { visual_type: "ai_image", visual_prompt: "wrist", motion: "zoom_in", script_line: "Nadie mira el cielo.", transition: "none" },
      ],
    });
    const focus = planSceneObjectFocus(film.scenes, lock);
    expect(focus[0]!.names).toEqual(["Mustang", "Balón"]);
    expect(focus[0]!.lock).toContain("Mustang and Balón");
    expect(focus[1]!.names).toEqual([]);
    expect(focus[1]!.lock).toMatch(/no named prop required/i);

    const next = applyVisualIdentity(film, undefined, undefined, lock);
    expect(next.scenes[0]!.visual_prompt).toContain("OBJECT LOCK");
    expect(next.scenes[0]!.visual_prompt).toContain("Mustang and Balón");
  });
});
