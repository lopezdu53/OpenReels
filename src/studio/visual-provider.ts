import {
  DEFAULT_GFLOW_IMAGE_MODEL,
  DEFAULT_GFLOW_VIDEO_MODE,
  DEFAULT_GFLOW_VIDEO_MODEL,
} from "../providers/gflow/catalog.js";
import { DEFAULT_TOBY_IMAGE_MODEL, DEFAULT_TOBY_VIDEO_MODE, DEFAULT_TOBY_VIDEO_MODEL } from "../providers/toby/catalog.js";
import { AtlasImage } from "../providers/image/atlas.js";
import { CloudflareImage } from "../providers/image/cloudflare.js";
import { GflowImage } from "../providers/image/gflow.js";
import { TobyImage } from "../providers/image/toby.js";
import { AtlasVideo } from "../providers/video/atlas.js";
import { CloudflareVideo } from "../providers/video/cloudflare.js";
import { GflowVideo } from "../providers/video/gflow.js";
import { TobyVideo } from "../providers/video/toby.js";
import type { ImageProvider, VideoProvider } from "../schema/providers.js";

/** Historia / Vox / Film: Atlas + gflow only. */
export const STUDIO_VISUAL_PROVIDERS = [
  { key: "atlas", label: "ATLAS Cloud" },
  { key: "gflow", label: "gflow (Imagen · Flow)" },
  { key: "cloudflare", label: "Cloudflare FLUX (T2I, sin I2V)" },
] as const;

/** Stickman: Toby first, then gflow, then Atlas. */
export const STICKMAN_VISUAL_PROVIDERS = [
  { key: "toby", label: "Toby (Flow MCP)" },
  { key: "gflow", label: "gflow (Imagen · Flow)" },
  { key: "atlas", label: "ATLAS Cloud" },
  { key: "cloudflare", label: "Cloudflare FLUX (T2I, sin I2V)" },
] as const;

export type StudioVisualProvider = (typeof STUDIO_VISUAL_PROVIDERS)[number]["key"];
export type StickmanVisualProvider = (typeof STICKMAN_VISUAL_PROVIDERS)[number]["key"];

export function resolveStudioVisualProvider(raw?: string): StudioVisualProvider {
  if (raw === "gflow") return "gflow";
  if (raw === "cloudflare") return "cloudflare";
  return "atlas";
}

export function resolveStickmanVisualProvider(raw?: string): StickmanVisualProvider {
  if (raw === "gflow") return "gflow";
  if (raw === "atlas") return "atlas";
  if (raw === "cloudflare") return "cloudflare";
  return "toby";
}

export function isFlowCreditsVisual(raw?: string): boolean {
  return raw === "gflow" || raw === "toby";
}

export function createStudioImage(opts: {
  visualProvider?: string;
  atlasModel?: string;
  atlasKey?: string;
  gflowModel?: string;
  tobyModel?: string;
}): ImageProvider {
  const stickman = resolveStickmanVisualProvider(opts.visualProvider);
  if (stickman === "cloudflare" || opts.visualProvider === "cloudflare") {
    return new CloudflareImage();
  }
  if (stickman === "toby") {
    return new TobyImage(opts.tobyModel || DEFAULT_TOBY_IMAGE_MODEL);
  }
  if (resolveStudioVisualProvider(opts.visualProvider) === "gflow") {
    return new GflowImage(opts.gflowModel || DEFAULT_GFLOW_IMAGE_MODEL);
  }
  return new AtlasImage(opts.atlasModel, opts.atlasKey);
}

export function createStudioVideo(opts: {
  visualProvider?: string;
  atlasModel?: string;
  atlasKey?: string;
  gflowModel?: string;
  gflowMode?: string;
  tobyModel?: string;
  tobyMode?: string;
}): VideoProvider {
  const stickman = resolveStickmanVisualProvider(opts.visualProvider);
  if (stickman === "cloudflare" || opts.visualProvider === "cloudflare") {
    return new CloudflareVideo();
  }
  if (stickman === "toby") {
    return new TobyVideo(
      opts.tobyModel || DEFAULT_TOBY_VIDEO_MODEL,
      opts.tobyMode || DEFAULT_TOBY_VIDEO_MODE,
    );
  }
  if (resolveStudioVisualProvider(opts.visualProvider) === "gflow") {
    return new GflowVideo(
      opts.gflowModel || DEFAULT_GFLOW_VIDEO_MODEL,
      opts.gflowMode || DEFAULT_GFLOW_VIDEO_MODE,
    );
  }
  return new AtlasVideo(opts.atlasModel, opts.atlasKey, null);
}
