/** Stickman-aligned Film durations (seconds). */
export const FILM_DURATION_SECONDS = [10, 20, 30, 60, 120, 300, 480, 900] as const;
/** Accept Flow's 15s cut so snapping the Film catalog does not rewrite it. */
const FILM_DURATION_SNAP = [10, 15, 20, 30, 60, 120, 300, 480, 900] as const;

export const FILM_TEST_15_MINUTES = 0.25;
export const FILM_TEST_15_SECONDS = 15;
/** 30-second Film test. */
export const FILM_TEST_MINUTES = 0.5;
export const FILM_ONE_MINUTE = 1;
export const FILM_TEST_SECONDS = 30;
export const FILM_WORDS_PER_MINUTE = 150;
/** Flow Veo / Atlas I2V clip. Remotion holds the last frame if VO is longer. */
export const FILM_CLIP_SECONDS = 8;
export const FILM_WORDS_PER_SCENE = 20;
export const FILM_MAX_SCENES = 60;

export const DEFAULT_FILM_MUTE_CHARACTER = true;
export const DEFAULT_FILM_VIDEO_VOLUME = 0.5;
export const DEFAULT_FILM_TTS_VOLUME = 1;
export const DEFAULT_FILM_LLM_MODEL = "google/gemini-2.5-flash";

export function formatFilmDurationSeconds(sec: number): string {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} min`;
  return `${sec}s`;
}

export function clampFilmVolume(raw: unknown, fallback: number): number {
  const n = Number(raw ?? fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, Math.round(n * 100) / 100));
}

export function filmDurationSeconds(minutes?: number): number | undefined {
  const normalized = normalizeFilmMinutes(minutes);
  if (normalized == null) return undefined;
  return Math.round(normalized * 60);
}

export function snapFilmDurationSeconds(rawSeconds: number): (typeof FILM_DURATION_SNAP)[number] {
  let best: (typeof FILM_DURATION_SNAP)[number] = FILM_DURATION_SNAP[0];
  let bestDiff = Math.abs(rawSeconds - best);
  for (const d of FILM_DURATION_SNAP) {
    const diff = Math.abs(rawSeconds - d);
    if (diff < bestDiff) {
      best = d;
      bestDiff = diff;
    }
  }
  return best;
}

export function isFilmTenSeconds(minutes?: number): boolean {
  return filmDurationSeconds(minutes) === 10;
}

export function isFilmTwentySeconds(minutes?: number): boolean {
  return filmDurationSeconds(minutes) === 20;
}

export function isFilmTest15Minutes(minutes?: number): boolean {
  return filmDurationSeconds(minutes) === 15;
}

export function isFilmTestMinutes(minutes?: number): boolean {
  return filmDurationSeconds(minutes) === 30;
}

/** Short test cuts share the same rules (no text cards, all AI video). */
export function isFilmQuickTest(minutes?: number): boolean {
  const sec = filmDurationSeconds(minutes);
  return sec === 10 || sec === 15 || sec === 20 || sec === 30;
}

export function isFilmOneMinute(minutes?: number): boolean {
  return filmDurationSeconds(minutes) === 60;
}

export function normalizeFilmMinutes(raw?: number): number | undefined {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return undefined;
  return snapFilmDurationSeconds(raw * 60) / 60;
}

export function filmWordsTarget(minutes: number): number {
  const sec = filmDurationSeconds(minutes) ?? Math.round(minutes * 60);
  if (sec === 10) return 25;
  if (sec === 15) return 38;
  if (sec === 20) return 50;
  if (sec === 30) return 75;
  if (sec === 60) return 180;
  return Math.round((sec / 60) * FILM_WORDS_PER_MINUTE);
}

export function filmSceneTarget(minutes: number): number {
  const sec = filmDurationSeconds(minutes) ?? Math.round(minutes * 60);
  if (sec === 10) return 3;
  if (sec === 15) return 3;
  if (sec === 20) return 3;
  if (sec === 30) return 4;
  if (sec === 60) return 8;
  return Math.min(FILM_MAX_SCENES, Math.max(4, Math.round(sec / FILM_CLIP_SECONDS)));
}

export function filmDurationLabel(minutes: number): string {
  const sec = filmDurationSeconds(minutes) ?? Math.round(minutes * 60);
  if (sec < 60) return `${sec} segundos`;
  if (sec === 60) return "1 minuto";
  return `${sec / 60} minutos`;
}

/** Horizontal / extend Films, including the short tests. */
export function isFilmJob(minutes?: number, platform?: string): boolean {
  if (platform === "youtube_horizontal" || platform === "reel_extend") return true;
  return minutes != null && minutes >= 2;
}
