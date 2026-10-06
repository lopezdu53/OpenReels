import {
  GFLOW_IMAGE_MODELS,
  GFLOW_VIDEO_MODELS,
  omniClipSeconds,
  omniSupportedDurations,
  planOmniTakes,
  resolveGflowImageModel,
  resolveGflowVideoMode,
  resolveGflowVideoModel,
  type GflowVideoMode,
} from "../gflow/catalog.js";

export const TOBY_MCP_DEFAULT_URL = "https://mcp.labs.toby.vn/mcp";

/** UI / catalog label: Toby_<flow-model-id> */
export function tobyModelLabel(id: string): string {
  const stripped = stripTobyLabel(id);
  if (stripped === "nano2" || stripped === "nano2.1" || stripped === "nano21") {
    return "Toby_nano2.1";
  }
  return `Toby_${stripped}`;
}

export function stripTobyLabel(raw?: string): string {
  const id = String(raw ?? "").trim();
  if (id.toLowerCase().startsWith("toby_")) return id.slice(5);
  return id;
}

export const TOBY_IMAGE_MODELS = GFLOW_IMAGE_MODELS.map((m) => ({
  ...m,
  label: tobyModelLabel(m.id),
}));

export const TOBY_VIDEO_MODELS = GFLOW_VIDEO_MODELS.map((m) => ({
  ...m,
  label: tobyModelLabel(m.id),
}));

export const DEFAULT_TOBY_IMAGE_MODEL = "nano-pro";
export const DEFAULT_TOBY_VIDEO_MODEL = "omni-flash";
export const DEFAULT_TOBY_VIDEO_MODE: GflowVideoMode = "i2v";

/** Names the Toby MCP `model` field accepts (not gflow-cli ids). */
const FLOW_IMAGE_NAMES: Record<string, string> = {
  "nano-pro": "Nano Banana Pro",
  /** Flow replaced Nano Banana 2 with 2.1 (Toby toast / MCP model list). */
  nano2: "Nano Banana 2.1",
  /** Lite stays the older family name until Flow lists a 2.1 Lite. */
  "nano-lite": "Nano Banana 2",
};

const FLOW_VIDEO_NAMES: Record<string, string> = {
  "omni-flash": "Omni Flash",
  "veo-lite": "Veo 3.1 Lite",
  "veo-fast": "Veo 3.1 Fast",
  "veo-quality": "Veo 3.1 Quality",
  "veo-lite-lp": "Veo 3.1 Lite",
};

export function resolveTobyImageModel(id?: string): string {
  return resolveGflowImageModel(stripTobyLabel(id) || DEFAULT_TOBY_IMAGE_MODEL);
}

export function resolveTobyVideoModel(id?: string): (typeof TOBY_VIDEO_MODELS)[number] {
  const resolved = resolveGflowVideoModel(stripTobyLabel(id) || DEFAULT_TOBY_VIDEO_MODEL);
  return TOBY_VIDEO_MODELS.find((m) => m.id === resolved.id) ?? TOBY_VIDEO_MODELS[0]!;
}

export function resolveTobyVideoMode(mode?: string): GflowVideoMode {
  return resolveGflowVideoMode(mode);
}

export function tobyFlowImageName(id?: string): string {
  const resolved = resolveTobyImageModel(id);
  return FLOW_IMAGE_NAMES[resolved] ?? resolved;
}

export function tobyFlowVideoName(id?: string): string {
  const resolved = resolveTobyVideoModel(id);
  return FLOW_VIDEO_NAMES[resolved.id] ?? resolved.id;
}

export function tobyMcpUrl(): string {
  return (process.env["TOBY_MCP_URL"]?.trim() || TOBY_MCP_DEFAULT_URL).replace(/\/$/, "");
}

export function tobyMcpToken(): string | undefined {
  const raw = process.env["TOBY_MCP_TOKEN"]?.trim();
  return raw || undefined;
}

export function tobyAgentToken(): string | undefined {
  const raw = process.env["TOBY_AGENT_TOKEN"]?.trim();
  return raw || tobyMcpToken();
}

export function tobyReady(): boolean {
  return Boolean(tobyMcpToken());
}

export function tobySubmitGapMs(): number {
  const n = Number(process.env["TOBY_SUBMIT_GAP_MS"] ?? 8000);
  return Number.isFinite(n) && n >= 0 ? n : 8000;
}

export function tobyImageTimeoutMs(): number {
  const n = Number(process.env["TOBY_IMAGE_TIMEOUT_MS"] ?? 600_000);
  return Number.isFinite(n) && n > 10_000 ? n : 600_000;
}

export function tobyVideoTimeoutMs(): number {
  const n = Number(process.env["TOBY_VIDEO_TIMEOUT_MS"] ?? 1_800_000);
  return Number.isFinite(n) && n > 30_000 ? n : 1_800_000;
}

export function tobyPublicBaseUrl(): string {
  const raw =
    process.env["APP_PUBLIC_URL"] ?? process.env["PUBLIC_BASE_URL"] ?? "http://localhost:3000";
  return raw.replace(/\/$/, "");
}

export { omniClipSeconds, omniSupportedDurations, planOmniTakes };
export type { GflowVideoMode as TobyVideoMode };
