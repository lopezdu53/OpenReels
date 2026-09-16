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
  {
    id: "joke_punchline",
    label: "Chiste → punchline",
    when: "humor rápido",
    hint: "Abre con un gancho y cierra con el chiste. Para temas cortos, memes o un solo gag.",
  },
  {
    id: "how_it_works",
    label: "Cómo funciona",
    when: "explicar un proceso",
    hint: "Explica un proceso paso a paso: qué es, cómo va y el resultado.",
  },
  {
    id: "vs_debate",
    label: "Cara a cara",
    when: "dos palitos discuten",
    hint: "Dos palitos se contradicen (mejor con elenco Dos palitos): uno dice A, el otro B.",
  },
  {
    id: "listicle",
    label: "Lista",
    when: "N puntos",
    hint: "Promete N puntos y los recorre uno a uno (tips, ranking, errores).",
  },
  {
    id: "origin",
    label: "Origen",
    when: "de dónde sale algo",
    hint: "Cuenta de dónde nace algo: el antes, el salto y cómo quedó hoy.",
  },
  {
    id: "warning",
    label: "Advertencia",
    when: "un error común",
    hint: "Señala un error común, por qué duele y cómo no caer.",
  },
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
/** Omni Flash is 10s; jobs are multiples so we never ask Flow for 6s leftovers. */
export const STICKMAN_DURATIONS = [10, 20, 30, 60, 120, 300, 480] as const;
export const STICKMAN_TAKE_XFADE_SEC = 0.12;
export const STICKMAN_FLOW_BED_VOLUME = 0.2;
/** Voice starts after the picture; last this many seconds stay bed-only. */
export const STICKMAN_VO_HEAD_SEC = 0.3;
export const STICKMAN_VO_TAIL_SEC = 0.5;
export const STICKMAN_VOICE_SPEEDS = [0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] as const;

export function clampStickmanVoiceSpeed(raw: unknown): number {
  const n = Number(raw ?? 1);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.5, Math.max(0.7, Math.round(n * 10) / 10));
}

export function stickmanSpokenWindow(videoSec: number): number {
  return Math.max(0.4, videoSec - STICKMAN_VO_HEAD_SEC - STICKMAN_VO_TAIL_SEC);
}

export const DEFAULT_STICKMAN_IMAGE_MODEL = "google/nano-banana-2-lite/text-to-image";
export const DEFAULT_STICKMAN_VIDEO_MODEL = "bytedance/seedance-2.0-mini/image-to-video";
export const DEFAULT_STICKMAN_TTS_MODEL = "xai/tts-v1";
export const DEFAULT_STICKMAN_LOOK = "classic";
export const DEFAULT_STICKMAN_ARC = "joke_punchline";
export const DEFAULT_STICKMAN_GFLOW_IMAGE = "nano-pro";
export const DEFAULT_STICKMAN_GFLOW_VIDEO = "omni-flash";

/** Atlas LLMs used only to write the stickman-video-director story. */
export const STICKMAN_LLMS = [
  {
    id: "google/gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    note: "mejor para historia de palitos",
    recommended: true,
  },
  {
    id: "google/gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    note: "más barato",
    recommended: false,
  },
  {
    id: "deepseek-ai/deepseek-v4-flash",
    label: "DeepSeek V4 Flash",
    note: "barato Atlas",
    recommended: false,
  },
] as const;

export const DEFAULT_STICKMAN_LLM = "google/gemini-2.5-flash";

export function isStickmanLlmId(id: string): boolean {
  return STICKMAN_LLMS.some((llm) => llm.id === id);
}

/**
 * Split a long job into model-legal I2V takes.
 * Omni 20s → [10, 10]; Veo 20s → [8, 8, 8]; Seedance 30s → [15, 15].
 */
export function planMotionTakes(supported: readonly number[], wanted: number): number[] {
  const clean = [...new Set(supported.filter((d) => d > 0))].sort((a, b) => a - b);
  const target = Math.max(1, Math.round(wanted));
  if (!clean.length) {
    const chunk = Math.min(15, Math.max(4, target));
    const n = Math.max(1, Math.ceil(target / chunk));
    return Array.from({ length: n }, (_, i) =>
      i === n - 1 ? Math.max(1, target - chunk * (n - 1)) : chunk,
    );
  }
  const max = clean.at(-1) ?? 4;
  if (target <= max) {
    if (clean.includes(target)) return [target];
    return [clean.find((d) => d >= target) ?? max];
  }
  const takes: number[] = [];
  let remaining = target;
  while (remaining > 0) {
    if (remaining <= max) {
      takes.push(clean.find((d) => d >= remaining) ?? max);
      break;
    }
    takes.push(max);
    remaining -= max;
  }
  return takes;
}

/** Best gflow pair: Banana Pro (0 cr) + Omni, chained when the job is longer than 10s. */
export function recommendStickmanGflow(durationSec: number): {
  imageModel: string;
  videoModel: string;
  clipSeconds: number;
  takes: number[];
} {
  const takes = planMotionTakes([4, 6, 8, 10], durationSec);
  return {
    imageModel: DEFAULT_STICKMAN_GFLOW_IMAGE,
    videoModel: DEFAULT_STICKMAN_GFLOW_VIDEO,
    clipSeconds: takes[0] ?? 10,
    takes,
  };
}

export function formatStickmanDuration(sec: number): string {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60} min`;
  return `${sec}s`;
}

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

export function stickmanArcHint(id: string): string {
  return STICKMAN_ARCS.find((arc) => arc.id === id)?.hint ?? "";
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
  if (seconds <= 10) return 3;
  if (seconds <= 20) return 4;
  if (seconds <= 30) return 6;
  if (seconds <= 60) return 8;
  if (seconds <= 120) return 12;
  if (seconds <= 300) return 18;
  return 24;
}

export function frameSize(aspect: string): { w: number; h: number } {
  if (aspect === "16:9") return { w: 1920, h: 1080 };
  if (aspect === "1:1") return { w: 1080, h: 1080 };
  return { w: 1080, h: 1920 };
}
