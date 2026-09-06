import { describe, expect, it } from "vitest";
import { buildCastBrief, buildFilmDirection, buildLocationBrief, buildObjectBrief, buildSequelBrief, extractScoreCastNames, parseYoutubeUrls, titleFromScript } from "./script.js";

describe("film script helpers", () => {
  it("parses unique YouTube urls", () => {
    const text = `
      mira https://youtu.be/abcDEF12345 y https://www.youtube.com/watch?v=abcDEF12345
      también https://youtube.com/shorts/xyzXYZ98765
    `;
    const urls = parseYoutubeUrls(text);
    expect(urls).toHaveLength(2);
    expect(urls.some((u) => u.includes("abcDEF12345"))).toBe(true);
  });

  it("builds a 16:9 direction that keeps the spoken script", () => {
    const dir = buildFilmDirection("Hola mundo. Esto es el guion.", ["https://youtu.be/abcDEF12345"]);
    expect(dir).toContain("Hola mundo");
    expect(dir).toContain("16:9");
    expect(dir).toContain("youtu.be/abcDEF12345");
    expect(dir).toContain("no reescribir");
  });

  it("takes the first spoken line as title", () => {
    expect(titleFromScript("# nota\n\nQué harías con un millón\n\nSegundo párrafo")).toBe(
      "Qué harías con un millón",
    );
  });

  it("lists 1–3 locked characters for the script LLM", () => {
    expect(buildCastBrief([])).toBe("");
    expect(buildCastBrief([{ name: "Coco", kind: "animal", species: "coatí" }])).toContain("1. Coco — animal — coatí");
    const three = buildCastBrief([
      { name: "Coco", species: "coatí" },
      { name: "Tambo", species: "gallito de las rocas" },
      { name: "Luz", kind: "human" },
      { name: "Extra" },
    ]);
    expect(three).toContain("3 personajes");
    expect(three).toContain("1. Coco");
    expect(three).toContain("3. Luz");
    expect(three).not.toContain("Extra");
  });

  it("marks the first character as camera hero in hero mode", () => {
    const brief = buildCastBrief(
      [
        { name: "Tania", kind: "human" },
        { name: "Casimiro", kind: "human" },
      ],
      "hero",
    );
    expect(brief).toContain("Héroe de cámara: Tania");
    expect(brief).toContain("TODOS los planos");
    expect(brief).toContain("Casimiro");
  });

  it("lists 1–3 locked locations for the script LLM", () => {
    expect(buildLocationBrief([])).toBe("");
    expect(buildLocationBrief([{ name: "Villa", place: "casa blanca" }])).toContain("1. Villa — casa blanca");
    const three = buildLocationBrief([
      { name: "Villa" },
      { name: "Oficina" },
      { name: "Selva" },
      { name: "Extra" },
    ]);
    expect(three).toContain("3");
    expect(three).toContain("1. Villa");
    expect(three).toContain("3. Selva");
    expect(three).not.toContain("Extra");
    expect(three).toMatch(/UNA por escena/i);
  });

  it("lists up to 10 locked objects for the script LLM", () => {
    expect(buildObjectBrief([])).toBe("");
    expect(buildObjectBrief([{ name: "Mustang", prompt: "rojo 1967" }])).toContain("1. Mustang — rojo 1967");
    const many = buildObjectBrief(
      Array.from({ length: 12 }, (_, i) => ({ name: `Obj${i + 1}` })),
    );
    expect(many).toContain("10");
    expect(many).toContain("1. Obj1");
    expect(many).toContain("10. Obj10");
    expect(many).not.toContain("Obj11");
    expect(many).toMatch(/pueden aparecer varios juntos/i);
  });

  it("builds a sequel brief from a produced episode", () => {
    const brief = buildSequelBrief({
      title: "Tania Conoce a Casimiro",
      characters: ["Tania", "Casimiro"],
      scenes: [
        { script_line: "Tania camina por Santorini.", location: "playa_santorini" },
        { script_line: "Casimiro gana la lotería." },
        { script_line: "¿Quieres saber qué pasa en esa cita?", location: "piscina" },
      ],
    });
    expect(brief).toContain("CONTINUACIÓN");
    expect(brief).toContain("Tania camina");
    expect(brief).toContain("esa cita");
    expect(brief).toContain("Tania, Casimiro");
    expect(brief).toContain("playa_santorini");
    expect(brief).toContain("No reinicies");
    expect(
      extractScoreCastNames({
        scenes: [{ visual_prompt: "ON SCREEN: only Tania. Name: Tania. | leftover" }],
      }),
    ).toEqual(["Tania"]);
  });
});
