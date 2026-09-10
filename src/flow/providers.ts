/** Stills: gflow Imagen (0.73+). Video: gflow I2V one scene at a time (t2v spends Flow credits). */
export const FLOW_IMAGE_PROVIDERS = [
  { key: "gflow", label: "gflow-cli (Imagen · Flow)" },
  { key: "vivi", label: "VIVI" },
  { key: "atlas", label: "ATLAS" },
] as const;

export const FLOW_VIDEO_PROVIDERS = [
  { key: "gflow", label: "gflow-cli (Veo I2V)" },
] as const;

export const FLOW_TTS_PROVIDERS = [
  { key: "kokoro", label: "Kokoro (Local)" },
  { key: "atlas-tts", label: "ATLAS" },
  { key: "grok-tts", label: "Grok TTS" },
  { key: "gemini-tts", label: "Gemini TTS" },
] as const;

export const DEFAULT_FLOW_IMAGE = "gflow";
export const DEFAULT_FLOW_TTS = "kokoro";
export const DEFAULT_GFLOW_VIDEO_MODE = "i2v";
