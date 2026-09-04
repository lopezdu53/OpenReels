/** Scenes we can turn into I2V (or back into a still). Stock and title cards stay put. */
const CONVERTIBLE = new Set(["ai_image", "ai_video"]);

export const VIDEO_SCENE_MODES = [
  "auto",
  "all",
  "first",
  "first3",
  "every2",
  "every2_offset",
  "force_all",
] as const;

export type VideoSceneMode = (typeof VIDEO_SCENE_MODES)[number];

/**
 * Collapse the old dual taxonomy (filter vs force_*) onto one assigner.
 * `all` / omitted = leave the director's mix (legacy).
 */
export function normalizeVideoSceneMode(raw?: string | null): VideoSceneMode {
  switch (raw) {
    case "auto":
      return "auto";
    case "force_all":
      return "force_all";
    case "first":
    case "force_first":
      return "first";
    case "first3":
    case "force_first3":
      return "first3";
    case "every2":
    case "first_every2":
    case "force_first_every2":
      return "every2";
    case "every2_offset":
      return "every2_offset";
    case "all":
    default:
      return "all";
  }
}

function convertibleIndexes(scenes: Array<{ visual_type: string }>): number[] {
  return scenes
    .map((s, i) => (CONVERTIBLE.has(s.visual_type) ? i : -1))
    .filter((i) => i >= 0);
}

function pickVideoSlots(convertible: number[], mode: VideoSceneMode): Set<number> {
  const want = new Set<number>();
  if (mode === "force_all") {
    for (const i of convertible) want.add(i);
    return want;
  }
  if (mode === "first") {
    if (convertible[0] != null) want.add(convertible[0]);
    return want;
  }
  if (mode === "first3") {
    for (const i of convertible.slice(0, 3)) want.add(i);
    return want;
  }
  if (mode === "every2") {
    convertible.forEach((i, n) => {
      if (n % 2 === 0) want.add(i);
    });
    return want;
  }
  if (mode === "every2_offset") {
    convertible.forEach((i, n) => {
      if (n % 2 === 1) want.add(i);
    });
  }
  return want;
}

/**
 * Assign which AI scenes become motion. Patterns apply to convertible
 * scenes in order (skipping text_card / stock), and they promote stills
 * when the director did not mark enough ai_video.
 */
export function applyVideoSceneMode<T extends { visual_type: string; motion?: string | null }>(
  scenes: T[],
  mode?: string | null,
): T[] {
  const normalized = normalizeVideoSceneMode(mode);
  if (!mode || normalized === "all" || normalized === "auto") return scenes;

  const convertible = convertibleIndexes(scenes);
  const want = pickVideoSlots(convertible, normalized);

  return scenes.map((scene, i) => {
    if (!CONVERTIBLE.has(scene.visual_type)) return scene;
    const asVideo = want.has(i);
    const nextType = asVideo ? "ai_video" : "ai_image";
    if (scene.visual_type === nextType && !(asVideo && scene.motion && scene.motion !== "static")) {
      return scene;
    }
    return {
      ...scene,
      visual_type: nextType,
      ...(asVideo ? { motion: "static" as const } : {}),
    };
  });
}

export function countVideoSceneTargets(sceneCount: number, mode?: string | null): number {
  const n = Math.max(0, sceneCount);
  if (n === 0) return 0;
  switch (normalizeVideoSceneMode(mode)) {
    case "first":
      return 1;
    case "first3":
      return Math.min(3, n);
    case "every2":
      return Math.ceil(n / 2);
    case "every2_offset":
      return Math.floor(n / 2);
    case "force_all":
      return n;
    case "auto":
    case "all":
    default:
      return Math.min(n, Math.max(2, Math.round(n / 4)));
  }
}

/** Instruction injected into the director so the score already follows the pattern. */
export function videoSceneModeGuidance(mode?: string | null, videoEnabled?: boolean): string {
  if (!videoEnabled) return "";
  const normalized = normalizeVideoSceneMode(mode);
  switch (normalized) {
    case "first":
      return "\nVIDEO PATTERN (mandatory): the first AI scene (skip text_card/stock) MUST be ai_video with motion static. Every later AI scene MUST be ai_image. Do not add extra ai_video.";
    case "first3":
      return "\nVIDEO PATTERN (mandatory): the first 3 AI scenes MUST be ai_video with motion static. Remaining AI scenes MUST be ai_image.";
    case "every2":
      return "\nVIDEO PATTERN (mandatory): alternate among AI scenes — 1st, 3rd, 5th… are ai_video (motion static); 2nd, 4th, 6th… are ai_image. Never two ai_video in a row. Skip text_card/stock when counting.";
    case "every2_offset":
      return "\nVIDEO PATTERN (mandatory): alternate among AI scenes starting with a still — 1st, 3rd, 5th… are ai_image; 2nd, 4th, 6th… are ai_video (motion static). Never two ai_video in a row.";
    case "force_all":
      return "\nVIDEO PATTERN (mandatory): EVERY ai_image/ai_video scene is ai_video with motion static. Do not use ai_image.";
    default:
      return "\nai_video: Use for 1-3 scenes where MOTION is the story. ai_video costs ~$0.30/scene vs ~$0.04 for ai_image. Use selectively. Set motion to 'static' for ai_video scenes.";
  }
}
