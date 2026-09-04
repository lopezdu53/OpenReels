import { describe, expect, it } from "vitest";
import { buildCastBrief, buildFilmDirection, parseYoutubeUrls, titleFromScript } from "./script.js";

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
});
