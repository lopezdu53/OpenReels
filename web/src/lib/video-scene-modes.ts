export interface VideoSceneModeOption {
  value: string;
  label: string;
  hint: string;
}

/** Producer-facing patterns. `auto` leaves the mix to the director (legacy "all"). */
export const VIDEO_SCENE_MODE_OPTIONS: VideoSceneModeOption[] = [
  { value: "every2", label: "Alternadas (1ª, 3ª, 5ª…)", hint: "Video, foto, video, foto — entre escenas IA" },
  { value: "every2_offset", label: "Alternadas (2ª, 4ª, 6ª…)", hint: "Foto, video, foto, video — entre escenas IA" },
  { value: "first", label: "Solo la 1ª escena IA", hint: "Un clip de movimiento al inicio" },
  { value: "first3", label: "Primeras 3 escenas IA", hint: "Apertura en movimiento, luego fotos" },
  { value: "force_all", label: "Todas las escenas IA", hint: "Cada plano IA se anima (más caro)" },
  { value: "auto", label: "Según el director (1–3)", hint: "El guion elige dónde hay movimiento" },
];

export const VIDEO_SCENE_MODE_LABELS: Record<string, string> = {
  auto: "Según el director",
  all: "Según el director",
  first: "Solo la 1ª escena IA",
  first3: "Primeras 3 escenas IA",
  every2: "Alternadas (1ª, 3ª, 5ª…)",
  first_every2: "Alternadas (1ª, 3ª, 5ª…)",
  every2_offset: "Alternadas (2ª, 4ª, 6ª…)",
  force_all: "Todas las escenas IA",
  force_first: "Solo la 1ª escena IA",
  force_first3: "Primeras 3 escenas IA",
  force_first_every2: "Alternadas (1ª, 3ª, 5ª…)",
};

export function countVideoScenesForPreview(sceneCount: number, mode: string | undefined, hasVideo: boolean): number {
  if (!hasVideo || sceneCount <= 0) return 0;
  switch (mode) {
    case "first":
    case "force_first":
      return 1;
    case "first3":
    case "force_first3":
      return Math.min(3, sceneCount);
    case "every2":
    case "first_every2":
    case "force_first_every2":
      return Math.ceil(sceneCount / 2);
    case "every2_offset":
      return Math.floor(sceneCount / 2);
    case "force_all":
      return sceneCount;
    case "auto":
    case "all":
    default:
      return Math.min(sceneCount, Math.max(2, Math.round(sceneCount / 4)));
  }
}
