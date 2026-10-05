import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getVideoDuration } from "../../pipeline/utils.js";
import {
  tobyFlowImageName,
  tobyFlowVideoName,
  tobyImageTimeoutMs,
  tobyPublicBaseUrl,
  tobyVideoTimeoutMs,
  resolveTobyImageModel,
  resolveTobyVideoModel,
  type TobyVideoMode,
} from "./catalog.js";
import { TobyError } from "./errors.js";
import { dataUriToBuffer, extractMediaUrls } from "./extract.js";
import {
  completeTobyResult,
  dropTobyPending,
  putTobyPublicAsset,
  registerTobyPending,
  waitTobyResult,
} from "./inbox.js";
import { tobyCallTool } from "./mcp.js";

let chain: Promise<void> = Promise.resolve();

function withTobyLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function hostTobyStill(buf: Buffer): Promise<string> {
  const id = await putTobyPublicAsset(buf, "image/png");
  return `${tobyPublicBaseUrl()}/api/v1/toby/public/${id}`;
}

async function downloadUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new TobyError(`Toby download HTTP ${res.status}: ${url.slice(0, 120)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 800) throw new TobyError(`Toby download too small (${buf.length})`);
  return buf;
}

function pickBuffer(kind: "image" | "video", payload: unknown): Buffer | null {
  const media = extractMediaUrls(payload);
  const data = media.dataUris
    .map(dataUriToBuffer)
    .find((b) => b && b.length > 800);
  if (data) return data;
  return null;
}

async function pickRemote(kind: "image" | "video", payload: unknown): Promise<Buffer | null> {
  const media = extractMediaUrls(payload);
  const urls = kind === "video" ? [...media.videos, ...media.images] : [...media.images, ...media.videos];
  for (const url of urls) {
    try {
      const buf = await downloadUrl(url);
      if (kind === "video" && buf.length < 8_000) continue;
      return buf;
    } catch {
      /* try next */
    }
  }
  return pickBuffer(kind, payload);
}

export async function generateTobyImage(opts: {
  prompt: string;
  aspect: string;
  model?: string;
  referencePng?: Buffer;
}): Promise<Buffer> {
  return withTobyLock(async () => {
    const jobId = await registerTobyPending("image");
    const model = resolveTobyImageModel(opts.model);
    const refs: string[] = [];
    if (opts.referencePng && opts.referencePng.length > 80) {
      refs.push(await hostTobyStill(opts.referencePng));
    }
    const args: Record<string, unknown> = {
      prompt: opts.prompt,
      provider: "flow",
      model,
      model_name: tobyFlowImageName(model),
      aspect_ratio: opts.aspect,
      aspect: opts.aspect,
      count: 1,
      job_id: jobId,
    };
    if (refs.length) {
      args.refs = refs;
      args.images = refs;
      args.image_urls = refs;
    }
    let mcpResult: unknown;
    try {
      mcpResult = await tobyCallTool("gen_image", args, tobyImageTimeoutMs());
    } catch (err) {
      await completeTobyResult(jobId, { ok: false, error: err instanceof Error ? err.message : String(err) }).catch(
        () => undefined,
      );
      throw err;
    }
    const fromMcp = await pickRemote("image", mcpResult);
    if (fromMcp && fromMcp.length >= 1000) {
      await dropTobyPending(jobId);
      return fromMcp;
    }
    return waitTobyResult(jobId, tobyImageTimeoutMs());
  });
}

export async function generateTobyVideo(opts: {
  prompt: string;
  aspect: string;
  model?: string;
  mode: TobyVideoMode;
  durationSeconds?: number;
  stillPng?: Buffer;
}): Promise<{ filePath: string; durationSeconds: number }> {
  return withTobyLock(async () => {
    const jobId = await registerTobyPending("video");
    const spec = resolveTobyVideoModel(opts.model);
    let imageUrl: string | undefined;
    if (opts.mode === "i2v") {
      if (!opts.stillPng || opts.stillPng.length < 80) {
        throw new TobyError("Toby I2V necesita still PNG");
      }
      imageUrl = await hostTobyStill(opts.stillPng);
    }
    const args: Record<string, unknown> = {
      prompt: opts.prompt,
      provider: "flow",
      model: spec.id,
      model_name: tobyFlowVideoName(spec.id),
      aspect_ratio: opts.aspect,
      aspect: opts.aspect,
      job_id: jobId,
    };
    if (opts.durationSeconds) args.duration = opts.durationSeconds;
    if (imageUrl) {
      args.image_url = imageUrl;
      args.refs = [imageUrl];
      args.images = [imageUrl];
      args.initial_frame = imageUrl;
    }
    let mcpResult: unknown;
    try {
      mcpResult = await tobyCallTool("gen_video", args, tobyVideoTimeoutMs());
    } catch (err) {
      await completeTobyResult(jobId, { ok: false, error: err instanceof Error ? err.message : String(err) }).catch(
        () => undefined,
      );
      throw err;
    }
    const fromMcp = await pickRemote("video", mcpResult);
    const buf = fromMcp && fromMcp.length >= 20_000 ? fromMcp : await waitTobyResult(jobId, tobyVideoTimeoutMs());
    if (fromMcp && fromMcp.length >= 20_000) await dropTobyPending(jobId);
    if (buf.length < 20_000) throw new TobyError(`Toby video too small (${buf.length} bytes)`);
    const dest = path.join(os.tmpdir(), `openreels-toby-${Date.now()}.mp4`);
    fs.writeFileSync(dest, buf);
    const probed = getVideoDuration(dest);
    return {
      filePath: dest,
      durationSeconds: probed && probed > 0.4 ? probed : (opts.durationSeconds ?? 8),
    };
  });
}

export function resetTobyLockForTests(): void {
  chain = Promise.resolve();
}
