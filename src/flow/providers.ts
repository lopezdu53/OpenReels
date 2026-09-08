/** Image: Atlas/VIVI work on any account. gflow t2i fails after flow.google.com migration. */
export const FLOW_IMAGE_PROVIDERS = [
  { key: "atlas", label: "ATLAS" },
  { key: "vivi", label: "VIVI" },
  { key: "gflow", label: "gflow-cli (Imagen · solo labs.google)" },
] as const;

export const FLOW_VIDEO_PROVIDERS = [
  { key: "gflow", label: "gflow-cli (Veo I2V)" },
] as const;

export const DEFAULT_FLOW_IMAGE = "atlas";
