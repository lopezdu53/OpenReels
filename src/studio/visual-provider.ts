import {
  DEFAULT_GFLOW_IMAGE_MODEL,
  DEFAULT_GFLOW_VIDEO_MODE,
  DEFAULT_GFLOW_VIDEO_MODEL,
} from "../providers/gflow/catalog.js";
import { AtlasImage } from "../providers/image/atlas.js";
import { GflowImage } from "../providers/image/gflow.js";
import { ViviImage } from "../providers/image/vivi.js";
import { AtlasVideo } from "../providers/video/atlas.js";
import { GflowVideo } from "../providers/video/gflow.js";
import { ViviVideo } from "../providers/video/vivi.js";
import type { ImageProvider, VideoProvider } from "../schema/providers.js";

export const STUDIO_VISUAL_PROVIDERS = [
  { key: "vivi", label: "VIVI" },
  { key: "atlas", label: "ATLAS Cloud" },
  { key: "gflow", label: "gflow (Imagen · Flow)" },
] as const;

export type StudioVisualProvider = (typeof STUDIO_VISUAL_PROVIDERS)[number]["key"];

export const DEFAULT_HISTORIA_VISUAL_PROVIDER: StudioVisualProvider = "vivi";

export function resolveStudioVisualProvider(raw?: string): StudioVisualProvider {
  if (raw === "gflow" || raw === "vivi" || raw === "atlas") return raw;
  return "atlas";
}

/** Nueva Historia: VIVI stills by default; Atlas and gflow stay on the list. */
export function resolveHistoriaVisualProvider(raw?: string): StudioVisualProvider {
  if (raw === "gflow" || raw === "vivi" || raw === "atlas") return raw;
  return DEFAULT_HISTORIA_VISUAL_PROVIDER;
}

export function createStudioImage(opts: {
  visualProvider?: string;
  atlasModel?: string;
  atlasKey?: string;
  gflowModel?: string;
  gflowBridgeId?: string;
}): ImageProvider {
  const provider = resolveStudioVisualProvider(opts.visualProvider);
  if (provider === "gflow") {
    return new GflowImage(opts.gflowModel || DEFAULT_GFLOW_IMAGE_MODEL, opts.gflowBridgeId);
  }
  if (provider === "vivi") {
    return new ViviImage();
  }
  return new AtlasImage(opts.atlasModel, opts.atlasKey);
}

export function createStudioVideo(opts: {
  visualProvider?: string;
  atlasModel?: string;
  atlasKey?: string;
  gflowModel?: string;
  gflowMode?: string;
  gflowBridgeId?: string;
}): VideoProvider {
  const provider = resolveStudioVisualProvider(opts.visualProvider);
  if (provider === "gflow") {
    return new GflowVideo(
      opts.gflowModel || DEFAULT_GFLOW_VIDEO_MODEL,
      opts.gflowMode || DEFAULT_GFLOW_VIDEO_MODE,
      opts.gflowBridgeId,
    );
  }
  if (provider === "vivi") {
    return new ViviVideo();
  }
  return new AtlasVideo(opts.atlasModel, opts.atlasKey, null);
}
