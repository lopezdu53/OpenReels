import { describe, expect, it } from "vitest";
import {
  FILM_TEST_MINUTES,
  filmSceneTarget,
  filmWordsTarget,
  isFilmJob,
  isFilmTestMinutes,
  normalizeFilmMinutes,
} from "./film-duration.js";

describe("film duration", () => {
  it("normalizes sub-2-minute requests to the 30s test", () => {
    expect(normalizeFilmMinutes(0.5)).toBe(FILM_TEST_MINUTES);
    expect(normalizeFilmMinutes(1)).toBe(FILM_TEST_MINUTES);
    expect(normalizeFilmMinutes(8)).toBe(8);
    expect(normalizeFilmMinutes(0)).toBeUndefined();
  });

  it("sizes a 30s test at ~6 scenes / 75 words", () => {
    expect(filmWordsTarget(FILM_TEST_MINUTES)).toBe(75);
    expect(filmSceneTarget(FILM_TEST_MINUTES)).toBe(6);
    expect(isFilmTestMinutes(FILM_TEST_MINUTES)).toBe(true);
    expect(isFilmJob(FILM_TEST_MINUTES, "youtube_horizontal")).toBe(true);
  });
});
