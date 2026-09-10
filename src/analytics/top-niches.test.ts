import { describe, expect, it } from "vitest";
import { CURATED_NICHE_SEEDS, curatedTopNiches } from "./top-niches.js";

describe("top niches", () => {
  it("ships exactly 10 curated niches with CPM", () => {
    expect(CURATED_NICHE_SEEDS).toHaveLength(10);
    const list = curatedTopNiches("LATAM");
    expect(list.niches).toHaveLength(10);
    expect(list.source).toBe("curated");
    expect(list.niches[0]?.rank).toBe(1);
    expect(list.niches[0]?.cpmLongformUsd).toBeGreaterThan(list.niches[0]?.cpmShortsUsd ?? 0);
    expect(list.niches.find((n) => n.query.includes("finanzas"))?.cpmLongformUsd).toBeGreaterThan(
      list.niches.find((n) => n.query.includes("videojuegos"))?.cpmLongformUsd ?? 0,
    );
  });
});
