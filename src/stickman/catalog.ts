import type { StickmanCastMode } from "./types.js";

export const STICKMAN_LOOKS = [
  {
    id: "classic",
    label: "Clásico",
    mood: "línea negra sobre blanco",
    prompt:
      "black 2-pixel ink stick figures on a pure white background, circle heads, no shading, no gradients",
  },
  {
    id: "chalk",
    label: "Tiza",
    mood: "pizarra",
    prompt:
      "white chalk stick figures on a matte blackboard, dusty single strokes, no photoreal chalk dust clouds",
  },
  {
    id: "neon",
    label: "Neón",
    mood: "líneas fluorescentes",
    prompt:
      "thin neon cyan and magenta stick figures on near-black, glow only on the lines, no 3D neon signs",
  },
  {
    id: "marker",
    label: "Rotulador",
    mood: "cuaderno",
    prompt:
      "thick black marker stick figures on cream notebook paper, clean pages, no torn paper, no tape, no collage",
  },
  {
    id: "doodle",
    label: "Garabato",
    mood: "bolígrafo",
    prompt:
      "messy ballpoint-pen stick figures on lined notebook paper, still only stick figures, no collage cut-outs",
  },
] as const;

export const STICKMAN_ARCS = [
  { id: "joke_punchline", label: "Chiste → punchline", when: "humor rápido" },
  { id: "how_it_works", label: "Cómo funciona", when: "explicar un proceso" },
  { id: "vs_debate", label: "Cara a cara", when: "dos palitos discuten" },
  { id: "listicle", label: "Lista", when: "N puntos" },
  { id: "origin", label: "Origen", when: "de dónde sale algo" },
  { id: "warning", label: "Advertencia", when: "un error común" },
] as const;

export const STICKMAN_CASTS = [
  { id: "solo", label: "Un palito" },
  { id: "duo", label: "Dos palitos" },
] as const;

export const STICKMAN_VOICES = [
  { id: "eve", label: "Eve", gender: "F", note: "enérgica" },
  { id: "ara", label: "Ara", gender: "F", note: "cálida" },
  { id: "leo", label: "Leo", gender: "M", note: "clara" },
  { id: "rex", label: "Rex", gender: "M", note: "segura" },
  { id: "sal", label: "Sal", gender: "M", note: "suave" },
] as const;

export const STICKMAN_ASPECTS = ["9:16", "16:9", "1:1"] as const;
export const STICKMAN_DURATIONS = [15, 30, 60, 90] as const;

export const DEFAULT_STICKMAN_IMAGE_MODEL = "google/nano-banana-2-lite/text-to-image";
export const DEFAULT_STICKMAN_VIDEO_MODEL = "bytedance/seedance-2.0-mini/image-to-video";
export const DEFAULT_STICKMAN_TTS_MODEL = "xai/tts-v1";
export const DEFAULT_STICKMAN_LOOK = "classic";
export const DEFAULT_STICKMAN_ARC = "joke_punchline";

export const STICKMAN_STYLE_LOCK = [
  "STRICT 2D STICKMAN LINE DRAWING ONLY.",
  "Circle or oval head. Two dot eyes. One-line mouth. Single-stroke limbs. Optional one tiny accessory.",
  "No photorealism. No 3D. No cinematic lighting. No sphere-head 3D character. No detailed faces or skin.",
  "No paper collage. No torn paper. No tape. No halftone. No editorial posters. No newsprint cut-outs.",
  "Flat solid background. Same stick figures in every frame. No text, no watermarks, no logos.",
].join(" ");

export function isLookId(id: string): boolean {
  return STICKMAN_LOOKS.some((look) => look.id === id);
}

export function isArcId(id: string): boolean {
  return STICKMAN_ARCS.some((arc) => arc.id === id);
}

export function isCastMode(id: string): id is StickmanCastMode {
  return STICKMAN_CASTS.some((cast) => cast.id === id);
}

export function lookPrompt(id: string): string {
  return STICKMAN_LOOKS.find((look) => look.id === id)?.prompt ?? STICKMAN_LOOKS[0].prompt;
}

export function recommendArc(topic: string): string {
  const t = topic.toLowerCase();
  if (/(vs|versus|debate|contra|pelea|discus)/.test(t)) return "vs_debate";
  if (/(cómo funciona|how it works|proceso|sistema|pasos)/.test(t)) return "how_it_works";
  if (/(formas de|tips|ranking|top \d|lista)/.test(t)) return "listicle";
  if (/(origen|de dónde|historia de|nació)/.test(t)) return "origin";
  if (/(cuidado|error|nunca|no hagas|warning)/.test(t)) return "warning";
  return "joke_punchline";
}

export function beatCountForDuration(seconds: number): number {
  if (seconds <= 15) return 4;
  if (seconds <= 30) return 6;
  if (seconds <= 60) return 8;
  return 10;
}

export function frameSize(aspect: string): { w: number; h: number } {
  if (aspect === "16:9") return { w: 1920, h: 1080 };
  if (aspect === "1:1") return { w: 1080, h: 1080 };
  return { w: 1080, h: 1920 };
}
