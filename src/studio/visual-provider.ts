import {
  DEFAULT_GFLOW_IMAGE_MODEL,
  DEFAULT_GFLOW_VIDEO_MODE,
  DEFAULT_GFLOW_VIDEO_MODEL,
} from "../providers/gflow/catalog.js";
import { AtlasImage } from "../providers/image/atlas.js";
import { GflowImage } from "../providers/image/gflow.js";
import { AtlasVideo } from "../providers/video/atlas.js";
import { GflowVideo } from "../providers/video/gflow.js";
import type { ImageProvider, VideoProvider } from "../schema/providers.js";

export const STUDIO_VISUAL_PROVIDERS = [
  { key: "atlas", label: "ATLAS Cloud" },
  { key: "gflow", label: "gflow (Imagen · Flow)" },
] as const;

export type StudioVisualProvider = (typeof STUDIO_VISUAL_PROVIDERS)[number]["key"];

export function resolveStudioVisualProvider(raw?: string): StudioVisualProvider {
  return raw === "gflow" ? "gflow" : "atlas";
}

export function createStudioImage(opts: {
  visualProvider?: string;
  atlasModel?: string;
  atlasKey?: string;
  gflowModel?: string;
  gflowBridgeId?: string;
}): ImageProvider {
  if (resolveStudioVisualProvider(opts.visualProvider) === "gflow") {
    return new GflowImage(opts.gflowModel || DEFAULT_GFLOW_IMAGE_MODEL, opts.gflowBridgeId);
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
  if (resolveStudioVisualProvider(opts.visualProvider) === "gflow") {
    return new GflowVideo(
      opts.gflowModel || DEFAULT_GFLOW_VIDEO_MODEL,
      opts.gflowMode || DEFAULT_GFLOW_VIDEO_MODE,
      opts.gflowBridgeId,
    );
  }
  return new AtlasVideo(opts.atlasModel, opts.atlasKey, null);
}
