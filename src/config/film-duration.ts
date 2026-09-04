/** 30-second Film test: faster iteration without an 8-minute shoot. */
export const FILM_TEST_MINUTES = 0.5;
export const FILM_ONE_MINUTE = 1;
export const FILM_TEST_SECONDS = 30;
export const FILM_WORDS_PER_MINUTE = 150;
export const FILM_WORDS_PER_SCENE = 12;
export const FILM_MAX_SCENES = 60;

export function isFilmTestMinutes(minutes?: number): boolean {
  return minutes != null && Number.isFinite(minutes) && minutes > 0 && minutes < 0.75;
}

export function isFilmOneMinute(minutes?: number): boolean {
  return minutes != null && Number.isFinite(minutes) && minutes >= 0.75 && minutes < 1.5;
}

export function normalizeFilmMinutes(raw?: number): number | undefined {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return undefined;
  if (raw < 0.75) return FILM_TEST_MINUTES;
  if (raw < 1.5) return FILM_ONE_MINUTE;
  return Math.min(20, Math.round(raw));
}

export function filmWordsTarget(minutes: number): number {
  return Math.round(minutes * FILM_WORDS_PER_MINUTE);
}

export function filmSceneTarget(minutes: number): number {
  const words = filmWordsTarget(minutes);
  return Math.min(FILM_MAX_SCENES, Math.max(4, Math.round(words / FILM_WORDS_PER_SCENE)));
}

export function filmDurationLabel(minutes: number): string {
  if (isFilmTestMinutes(minutes)) return "30 segundos";
  if (isFilmOneMinute(minutes)) return "1 minuto";
  return `${minutes} minutos`;
}

/** Horizontal / extend Films, including the 30s test and 1-minute cut. */
export function isFilmJob(minutes?: number, platform?: string): boolean {
  if (platform === "youtube_horizontal" || platform === "reel_extend") return true;
  return minutes != null && minutes >= 2;
}
