import { describe, expect, it } from "vitest";
import {
  FILM_ONE_MINUTE,
  FILM_TEST_15_MINUTES,
  FILM_TEST_MINUTES,
  filmDurationLabel,
  filmSceneTarget,
  filmWordsTarget,
  isFilmJob,
  isFilmOneMinute,
  isFilmQuickTest,
  isFilmTest15Minutes,
  isFilmTestMinutes,
  normalizeFilmMinutes,
} from "./film-duration.js";

describe("film duration", () => {
  it("keeps 15s, 30s and 1 minute as distinct cuts", () => {
    expect(normalizeFilmMinutes(0.25)).toBe(FILM_TEST_15_MINUTES);
    expect(normalizeFilmMinutes(0.5)).toBe(FILM_TEST_MINUTES);
    expect(normalizeFilmMinutes(1)).toBe(FILM_ONE_MINUTE);
    expect(normalizeFilmMinutes(8)).toBe(8);
    expect(normalizeFilmMinutes(0)).toBeUndefined();
    expect(isFilmTest15Minutes(0.25)).toBe(true);
    expect(isFilmTestMinutes(0.25)).toBe(false);
    expect(isFilmTestMinutes(1)).toBe(false);
    expect(isFilmQuickTest(0.25)).toBe(true);
    expect(isFilmOneMinute(1)).toBe(true);
    expect(filmDurationLabel(0.25)).toBe("15 segundos");
    expect(filmDurationLabel(1)).toBe("1 minuto");
  });

  it("sizes a 15s test at 3 scenes / 38 words", () => {
    expect(filmWordsTarget(FILM_TEST_15_MINUTES)).toBe(38);
    expect(filmSceneTarget(FILM_TEST_15_MINUTES)).toBe(3);
    expect(isFilmJob(FILM_TEST_15_MINUTES, "youtube_horizontal")).toBe(true);
  });

  it("sizes a 30s test at ~6 scenes / 75 words", () => {
    expect(filmWordsTarget(FILM_TEST_MINUTES)).toBe(75);
    expect(filmSceneTarget(FILM_TEST_MINUTES)).toBe(6);
    expect(isFilmTestMinutes(FILM_TEST_MINUTES)).toBe(true);
    expect(isFilmJob(FILM_TEST_MINUTES, "youtube_horizontal")).toBe(true);
  });

  it("sizes a 1-minute film so fast TTS still reaches ~60s", () => {
    expect(filmWordsTarget(FILM_ONE_MINUTE)).toBe(180);
    expect(filmSceneTarget(FILM_ONE_MINUTE)).toBe(15);
  });
});
