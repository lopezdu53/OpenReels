import { describe, expect, it } from "vitest";
import {
  buildCharacterSheetPrompt,
  buildLocationSheetPrompt,
  buildObjectSheetPrompt,
  buildStyleSheetPrompt,
  normalizeCharacterKind,
  normalizeSheetProvider,
} from "./sheets.js";

describe("concept sheets", () => {
  it("locks animal species and asks for four views", () => {
    const prompt = buildCharacterSheetPrompt({
      name: "Rayitas",
      kind: "animal",
      species: "tigrillo ocelote cachorro",
      appearance: "pelaje amarillo pálido con ocelos",
      mustAvoid: "tigre de Bengala",
    });
    expect(prompt).toContain("MODEL SHEET");
    expect(prompt).toContain("FRONT");
    expect(prompt).toContain("PORTRAIT");
    expect(prompt).toContain("PROFILE");
    expect(prompt).toContain("BACK");
    expect(prompt).toContain("ocelote");
    expect(prompt).toContain("Bengal");
    expect(prompt).toContain("16:9");
    expect(prompt).toMatch(/letterbox/i);
  });

  it("marks humans as human and fictional as fictional", () => {
    expect(buildCharacterSheetPrompt({ name: "Ana", kind: "human", species: "humano", appearance: "cabello oscuro, ojos cafe" })).toContain("HUMAN");
    expect(buildCharacterSheetPrompt({ name: "Nyx", kind: "fictional", species: "elfa", appearance: "orejas largas, piel plateada" })).toContain("FICTIONAL");
    expect(normalizeCharacterKind("nope")).toBe("fictional");
    expect(normalizeSheetProvider(undefined)).toBe("vivi");
    expect(normalizeSheetProvider("gemini")).toBe("gemini");
  });

  it("builds an environment style board", () => {
    const prompt = buildStyleSheetPrompt({
      name: "Selva cine",
      artStyle: "Filmic jungle, golden hour, 35mm",
      palette: "amber, moss",
    });
    expect(prompt).toContain("ENVIRONMENT");
    expect(prompt).toContain("TEXTURE");
    expect(prompt).toContain("golden hour");
    expect(prompt).toMatch(/letterbox/i);
  });

  it("builds a single-place location board", () => {
    const prompt = buildLocationSheetPrompt({
      name: "Villa Santorini",
      place: "villa blanca de cal, terrazas, mar Egeo",
      mustAvoid: "oficina de cristal",
    });
    expect(prompt).toContain("LOCATION");
    expect(prompt).toContain("ESTABLISH");
    expect(prompt).toContain("Villa Santorini");
    expect(prompt).toContain("ONE named place");
    expect(prompt).toContain("oficina");
    expect(prompt).toMatch(/letterbox/i);
  });

  it("builds a single-object prop board from a prompt", () => {
    const prompt = buildObjectSheetPrompt({
      name: "Mustang",
      prompt: "Fastback 1967 rojo cereza, cromados",
      notes: "sin conductor",
    });
    expect(prompt).toContain("OBJECT");
    expect(prompt).toContain("HERO");
    expect(prompt).toContain("Mustang");
    expect(prompt).toContain("1967");
    expect(prompt).toContain("ONE named object");
    expect(prompt).toMatch(/letterbox/i);
  });
});
