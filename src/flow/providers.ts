/** Image + Veo via headed Chrome / LAN bridge. Agent chip must stay OFF. */
export const FLOW_IMAGE_PROVIDERS = [
  { key: "gflow", label: "gflow-cli (Imagen · Flow)" },
  { key: "atlas", label: "ATLAS" },
  { key: "vivi", label: "VIVI" },
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

export const DEFAULT_FLOW_IMAGE = "gflow";
export const DEFAULT_FLOW_TTS = "kokoro";
export const DEFAULT_GFLOW_VIDEO_MODE = "t2v";
