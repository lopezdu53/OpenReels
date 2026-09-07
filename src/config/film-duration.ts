/** 15-second Film test: cheapest Hero / I2V iteration. */
export const FILM_TEST_15_MINUTES = 0.25;
export const FILM_TEST_15_SECONDS = 15;
/** 30-second Film test: faster iteration without an 8-minute shoot. */
export const FILM_TEST_MINUTES = 0.5;
export const FILM_ONE_MINUTE = 1;
export const FILM_TEST_SECONDS = 30;
export const FILM_WORDS_PER_MINUTE = 150;
export const FILM_WORDS_PER_SCENE = 12;
export const FILM_MAX_SCENES = 60;

export function isFilmTest15Minutes(minutes?: number): boolean {
  return minutes != null && Number.isFinite(minutes) && minutes > 0 && minutes < 0.375;
}

export function isFilmTestMinutes(minutes?: number): boolean {
  return minutes != null && Number.isFinite(minutes) && minutes >= 0.375 && minutes < 0.75;
}

/** 15s or 30s test cuts share the same rules (no text cards, all AI video). */
export function isFilmQuickTest(minutes?: number): boolean {
  return isFilmTest15Minutes(minutes) || isFilmTestMinutes(minutes);
}

export function isFilmOneMinute(minutes?: number): boolean {
  return minutes != null && Number.isFinite(minutes) && minutes >= 0.75 && minutes < 1.5;
}

export function normalizeFilmMinutes(raw?: number): number | undefined {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return undefined;
  if (raw < 0.375) return FILM_TEST_15_MINUTES;
  if (raw < 0.75) return FILM_TEST_MINUTES;
  if (raw < 1.5) return FILM_ONE_MINUTE;
  return Math.min(20, Math.round(raw));
}

export function filmWordsTarget(minutes: number): number {
  if (isFilmTest15Minutes(minutes)) return 38;
  // Fast TTS (Kokoro / ElevenLabs) often speaks ~180 wpm. 150 words lands near 46–50s.
  if (isFilmOneMinute(minutes)) return 180;
  return Math.round(minutes * FILM_WORDS_PER_MINUTE);
}

export function filmSceneTarget(minutes: number): number {
  if (isFilmTest15Minutes(minutes)) return 3;
  const words = filmWordsTarget(minutes);
  return Math.min(FILM_MAX_SCENES, Math.max(4, Math.round(words / FILM_WORDS_PER_SCENE)));
}

export function filmDurationLabel(minutes: number): string {
  if (isFilmTest15Minutes(minutes)) return "15 segundos";
  if (isFilmTestMinutes(minutes)) return "30 segundos";
  if (isFilmOneMinute(minutes)) return "1 minuto";
  return `${minutes} minutos`;
}

/** Horizontal / extend Films, including the 15s/30s tests and 1-minute cut. */
export function isFilmJob(minutes?: number, platform?: string): boolean {
  if (platform === "youtube_horizontal" || platform === "reel_extend") return true;
  return minutes != null && minutes >= 2;
}
