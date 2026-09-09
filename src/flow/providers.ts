/** Stills default to VIVI. Veo t2v stays on gflow (headed Chrome / LAN bridge). */
export const FLOW_IMAGE_PROVIDERS = [
  { key: "vivi", label: "VIVI" },
  { key: "atlas", label: "ATLAS" },
  { key: "gflow", label: "gflow-cli (Imagen · Flow)" },
] as const;

export const FLOW_VIDEO_PROVIDERS = [
  { key: "gflow", label: "gflow-cli (Veo t2v)" },
] as const;

export const FLOW_TTS_PROVIDERS = [
  { key: "kokoro", label: "Kokoro (Local)" },
  { key: "atlas-tts", label: "ATLAS" },
  { key: "grok-tts", label: "Grok TTS" },
  { key: "gemini-tts", label: "Gemini TTS" },
] as const;

export const DEFAULT_FLOW_IMAGE = "vivi";
export const DEFAULT_FLOW_TTS = "kokoro";
export const DEFAULT_GFLOW_VIDEO_MODE = "t2v";
