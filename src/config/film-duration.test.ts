import { describe, expect, it } from "vitest";
import {
  FILM_ONE_MINUTE,
  FILM_TEST_MINUTES,
  filmDurationLabel,
  filmSceneTarget,
  filmWordsTarget,
  isFilmJob,
  isFilmOneMinute,
  isFilmTestMinutes,
  normalizeFilmMinutes,
} from "./film-duration.js";

describe("film duration", () => {
  it("keeps 30s and 1 minute as distinct cuts", () => {
    expect(normalizeFilmMinutes(0.5)).toBe(FILM_TEST_MINUTES);
    expect(normalizeFilmMinutes(1)).toBe(FILM_ONE_MINUTE);
    expect(normalizeFilmMinutes(8)).toBe(8);
    expect(normalizeFilmMinutes(0)).toBeUndefined();
    expect(isFilmTestMinutes(1)).toBe(false);
    expect(isFilmOneMinute(1)).toBe(true);
    expect(filmDurationLabel(1)).toBe("1 minuto");
  });

  it("sizes a 30s test at ~6 scenes / 75 words", () => {
    expect(filmWordsTarget(FILM_TEST_MINUTES)).toBe(75);
    expect(filmSceneTarget(FILM_TEST_MINUTES)).toBe(6);
    expect(isFilmTestMinutes(FILM_TEST_MINUTES)).toBe(true);
    expect(isFilmJob(FILM_TEST_MINUTES, "youtube_horizontal")).toBe(true);
  });

  it("sizes a 1-minute film at ~13 scenes / 150 words", () => {
    expect(filmWordsTarget(FILM_ONE_MINUTE)).toBe(150);
    expect(filmSceneTarget(FILM_ONE_MINUTE)).toBe(13);
  });
});
