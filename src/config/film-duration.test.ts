import { describe, expect, it } from "vitest";
import {
  clampFilmVolume,
  FILM_DURATION_SECONDS,
  FILM_ONE_MINUTE,
  FILM_TEST_15_MINUTES,
  FILM_TEST_MINUTES,
  filmDurationLabel,
  filmDurationSeconds,
  filmSceneTarget,
  filmWordsTarget,
  formatFilmDurationSeconds,
  isFilmJob,
  isFilmOneMinute,
  isFilmQuickTest,
  isFilmTenSeconds,
  isFilmTestMinutes,
  isFilmTwentySeconds,
  normalizeFilmMinutes,
} from "./film-duration.js";

describe("film duration", () => {
  it("snaps to the Stickman catalog (10s–15min)", () => {
    expect(FILM_DURATION_SECONDS).toEqual([10, 20, 30, 60, 120, 300, 480, 900]);
    expect(normalizeFilmMinutes(10 / 60)).toBeCloseTo(10 / 60);
    expect(normalizeFilmMinutes(20 / 60)).toBeCloseTo(20 / 60);
    expect(normalizeFilmMinutes(0.25)).toBe(FILM_TEST_15_MINUTES);
    expect(normalizeFilmMinutes(0.5)).toBe(FILM_TEST_MINUTES);
    expect(normalizeFilmMinutes(1)).toBe(FILM_ONE_MINUTE);
    expect(normalizeFilmMinutes(8)).toBe(8);
    expect(normalizeFilmMinutes(15)).toBe(15);
    expect(normalizeFilmMinutes(20)).toBe(15);
    expect(normalizeFilmMinutes(0)).toBeUndefined();
    expect(filmDurationSeconds(10 / 60)).toBe(10);
    expect(isFilmTenSeconds(10 / 60)).toBe(true);
    expect(isFilmTwentySeconds(20 / 60)).toBe(true);
    expect(isFilmTestMinutes(0.5)).toBe(true);
    expect(isFilmQuickTest(10 / 60)).toBe(true);
    expect(isFilmQuickTest(20 / 60)).toBe(true);
    expect(isFilmOneMinute(1)).toBe(true);
    expect(filmDurationLabel(10 / 60)).toBe("10 segundos");
    expect(filmDurationLabel(1)).toBe("1 minuto");
    expect(formatFilmDurationSeconds(10)).toBe("10s");
    expect(formatFilmDurationSeconds(480)).toBe("8 min");
  });

  it("sizes a 10s test at 3 scenes / 25 words", () => {
    expect(filmWordsTarget(10 / 60)).toBe(25);
    expect(filmSceneTarget(10 / 60)).toBe(3);
    expect(isFilmJob(10 / 60, "youtube_horizontal")).toBe(true);
  });

  it("sizes a 20s test at 3 scenes / 50 words", () => {
    expect(filmWordsTarget(20 / 60)).toBe(50);
    expect(filmSceneTarget(20 / 60)).toBe(3);
  });

  it("sizes a 30s test at 4 scenes / 75 words", () => {
    expect(filmWordsTarget(FILM_TEST_MINUTES)).toBe(75);
    expect(filmSceneTarget(FILM_TEST_MINUTES)).toBe(4);
    expect(isFilmTestMinutes(FILM_TEST_MINUTES)).toBe(true);
    expect(isFilmJob(FILM_TEST_MINUTES, "youtube_horizontal")).toBe(true);
  });

  it("sizes a 1-minute film so fast TTS still reaches ~60s", () => {
    expect(filmWordsTarget(FILM_ONE_MINUTE)).toBe(180);
    expect(filmSceneTarget(FILM_ONE_MINUTE)).toBe(8);
  });

  it("sizes a 5-minute Flow film for 8s Veo clips", () => {
    expect(filmWordsTarget(5)).toBe(750);
    expect(filmSceneTarget(5)).toBe(38);
  });

  it("clamps mix volumes like Stickman", () => {
    expect(clampFilmVolume(0.5, 1)).toBe(0.5);
    expect(clampFilmVolume(2, 0.5)).toBe(1);
    expect(clampFilmVolume(-1, 0.5)).toBe(0);
    expect(clampFilmVolume("nope", 0.5)).toBe(0.5);
  });
});
