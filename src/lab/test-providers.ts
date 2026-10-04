import { AliCloudImage } from "../providers/image/alicloud.js";
import { AtlasImage } from "../providers/image/atlas.js";
import { FalImage } from "../providers/image/fal.js";
import { GeminiImage } from "../providers/image/gemini.js";
import { GflowImage } from "../providers/image/gflow.js";
import { GrokImage } from "../providers/image/grok.js";
import { OpenAIImage } from "../providers/image/openai.js";
import { RunPodImage } from "../providers/image/runpod.js";
import { SharpiiImage } from "../providers/image/sharpii.js";
import { ViviImage } from "../providers/image/vivi.js";
import { resolveGflowVideoMode } from "../providers/gflow/catalog.js";
import { AtlasVideo } from "../providers/video/atlas.js";
import { FalVideo } from "../providers/video/fal.js";
import { GeminiVideo } from "../providers/video/gemini.js";
import { GflowVideo } from "../providers/video/gflow.js";
import { GrokVideo } from "../providers/video/grok.js";
import { RunPodVideo } from "../providers/video/runpod.js";
import { SharpiiVideo } from "../providers/video/sharpii.js";
import { ViviVideo } from "../providers/video/vivi.js";
import type { ImageProvider, VideoProvider } from "../schema/providers.js";

export function createLabImageProvider(opts: {
  provider?: string;
  model?: string;
  steps?: number;
  guidance?: number;
}): ImageProvider {
  switch (opts.provider) {
    case "gflow":
      return new GflowImage(opts.model);
    case "openai":
      return new OpenAIImage();
    case "grok":
      return new GrokImage();
    case "vivi":
      return new ViviImage();
    case "alicloud":
      return new AliCloudImage();
    case "runpod":
      return new RunPodImage({ model: opts.model, steps: opts.steps, guidance: opts.guidance });
    case "fal":
      return new FalImage();
    case "sharpii":
      return new SharpiiImage(opts.model);
    case "atlas":
      return new AtlasImage(opts.model);
    default:
      return new GeminiImage();
  }
}

export function createLabVideoProvider(opts: {
  provider?: string;
  model?: string;
  mode?: string;
  resolution?: string;
  lipSyncModel?: string | null;
}): VideoProvider {
  switch (opts.provider) {
    case "gflow":
      return new GflowVideo(opts.model, resolveGflowVideoMode(opts.mode));
    case "grok":
      return new GrokVideo();
    case "vivi":
      return new ViviVideo();
    case "fal":
      return new FalVideo();
    case "runpod":
      return new RunPodVideo({ model: opts.model, resolution: opts.resolution });
    case "sharpii":
      return new SharpiiVideo(opts.model);
    case "atlas":
      return new AtlasVideo(opts.model, undefined, opts.lipSyncModel === "none" ? null : opts.lipSyncModel);
    default:
      return new GeminiVideo();
  }
}

export function labVideoRequiresStill(provider?: string, mode?: string): boolean {
  return provider !== "gflow" || resolveGflowVideoMode(mode) === "i2v";
}
