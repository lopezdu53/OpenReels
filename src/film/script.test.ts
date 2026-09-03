import { describe, expect, it } from "vitest";
import { buildFilmDirection, parseYoutubeUrls, titleFromScript } from "./script.js";

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
});
