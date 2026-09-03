/** 30-second Film test: faster iteration without an 8-minute shoot. */
export const FILM_TEST_MINUTES = 0.5;
export const FILM_TEST_SECONDS = 30;
export const FILM_WORDS_PER_MINUTE = 150;
export const FILM_WORDS_PER_SCENE = 12;
export const FILM_MAX_SCENES = 60;

export function isFilmTestMinutes(minutes?: number): boolean {
  return minutes != null && Number.isFinite(minutes) && minutes > 0 && minutes < 2;
}

export function normalizeFilmMinutes(raw?: number): number | undefined {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return undefined;
  if (raw < 2) return FILM_TEST_MINUTES;
  return Math.min(20, raw);
}

export function filmWordsTarget(minutes: number): number {
  return Math.round(minutes * FILM_WORDS_PER_MINUTE);
}

export function filmSceneTarget(minutes: number): number {
  const words = filmWordsTarget(minutes);
  return Math.min(FILM_MAX_SCENES, Math.max(4, Math.round(words / FILM_WORDS_PER_SCENE)));
}

/** Horizontal / extend Films, including the 30s test. */
export function isFilmJob(minutes?: number, platform?: string): boolean {
  if (platform === "youtube_horizontal" || platform === "reel_extend") return true;
  return minutes != null && minutes >= 2;
}
