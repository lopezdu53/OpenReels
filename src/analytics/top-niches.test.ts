import { describe, expect, it } from "vitest";
import { CURATED_NICHE_SEEDS, curatedTopNiches, rotateCuratedSeeds } from "./top-niches.js";

describe("top niches", () => {
  it("ships a rotating pool of 10 niches with CPM", () => {
    expect(CURATED_NICHE_SEEDS.length).toBeGreaterThanOrEqual(20);
    const list = curatedTopNiches("LATAM", { at: new Date("2026-01-05T00:00:00Z") });
    expect(list.niches).toHaveLength(10);
    expect(list.source).toBe("curated");
    expect(list.niches[0]?.rank).toBe(1);
    expect(list.niches[0]?.cpmLongformUsd).toBeGreaterThan(list.niches[0]?.cpmShortsUsd ?? 0);
    const finance = CURATED_NICHE_SEEDS.find((n) => n.query.includes("finanzas"));
    const games = CURATED_NICHE_SEEDS.find((n) => n.query.includes("videojuegos"));
    expect(finance && games).toBeTruthy();
  });

  it("changes the weekly ranking so the same 10 are not always first", () => {
    const a = rotateCuratedSeeds({ at: new Date("2026-01-05T00:00:00Z") }).map((n) => n.query);
    const b = rotateCuratedSeeds({ at: new Date("2026-03-16T00:00:00Z") }).map((n) => n.query);
    const c = rotateCuratedSeeds({ at: new Date("2026-03-16T00:00:00Z"), salt: "explore" }).map(
      (n) => n.query,
    );
    expect(a).not.toEqual(b);
    expect(b).not.toEqual(c);
    expect(new Set(a).size).toBe(10);
  });
});
