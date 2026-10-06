import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getVideoDuration } from "../../pipeline/utils.js";
import {
  tobyFlowImageName,
  tobyFlowVideoName,
  tobyImageTimeoutMs,
  tobyPublicBaseUrl,
  tobySubmitGapMs,
  tobyVideoTimeoutMs,
  resolveTobyImageModel,
  resolveTobyVideoModel,
  type TobyVideoMode,
} from "./catalog.js";
import { TobyError } from "./errors.js";
import { dataUriToBuffer, extractMcpBuffers, extractMediaUrls } from "./extract.js";
import {
  completeTobyResult,
  dropTobyPending,
  failAllTobyPending,
  putTobyPublicAsset,
  registerTobyPending,
  waitTobyResult,
} from "./inbox.js";
import { resetTobyMcpSession, tobyCallTool } from "./mcp.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let chain: Promise<void> = Promise.resolve();
let tobyOwner: string | undefined;
let inflightAbort: (() => void) | undefined;

export function setTobyOwner(id: string | undefined): void {
  tobyOwner = id;
}

export async function interruptTobyForJob(id: string): Promise<void> {
  if (!id || tobyOwner !== id) return;
  inflightAbort?.();
  await failAllTobyPending("El trabajo fue cancelado");
}

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
  const embedded = extractMcpBuffers(payload, kind)[0];
  if (embedded) return embedded;
  const media = extractMediaUrls(payload);
  const data = media.dataUris
    .map(dataUriToBuffer)
    .find((b) => b && b.length > 800);
  if (data) return data;
  return null;
}

function isHardTobyFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /VALIDATION|invalid for flow|Unauthenticat|401|Falta TOBY_MCP_TOKEN|Token inválido/i.test(msg);
}

/** MCP never reached Flow — do not sit 10 min on the inbox. */
export function isTobySubmitFailure(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  if (isHardTobyFailure(err)) return true;
  return /Toby MCP no responde|HTTP [45]\d\d|Falta TOBY|initialize|ENOTFOUND|ECONNREFUSED|fetch failed|certificate|Token inválido/i.test(
    msg,
  );
}

/** Inbox can land while MCP is still open — Flow already downloaded on Windows. */
async function firstTobyBytes(
  jobId: string,
  mcpPromise: Promise<Buffer | null>,
  inboxPromise: Promise<Buffer>,
  cancelMcp?: () => void,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let done = false;
    const finishOk = (buf: Buffer, fromMcp: boolean) => {
      if (done) return;
      done = true;
      if (fromMcp) void dropTobyPending(jobId);
      else cancelMcp?.();
      resolve(buf);
    };
    const finishErr = (err: unknown) => {
      if (done) return;
      done = true;
      reject(err);
    };
    mcpPromise
      .then((buf) => {
        if (buf && buf.length >= 1000) finishOk(buf, true);
      })
      .catch((err) => {
        finishErr(err);
      });
    inboxPromise.then((buf) => finishOk(buf, false), finishErr);
  });
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
      model: tobyFlowImageName(model),
      aspect_ratio: opts.aspect,
      count: 1,
    };
    if (refs.length) {
      args.refs = refs;
      args.images = refs;
      args.image_urls = refs;
    }
    const timeoutMs = tobyImageTimeoutMs();
    const ctrl = new AbortController();
    inflightAbort = () => ctrl.abort();
    let submitted = false;
    const mcpPromise = tobyCallTool("gen_image", args, timeoutMs, ctrl.signal, () => {
      submitted = true;
      console.log(`[toby] gen_image enviado · ${tobyFlowImageName(model)} · ${opts.aspect}`);
    })
      .then((mcpResult) => pickRemote("image", mcpResult))
      .catch(async (err) => {
        if (!submitted || isTobySubmitFailure(err)) {
          await completeTobyResult(jobId, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }).catch(() => undefined);
        }
        throw err;
      });
    try {
      return await firstTobyBytes(jobId, mcpPromise, waitTobyResult(jobId, timeoutMs), () =>
        ctrl.abort(),
      );
    } finally {
      inflightAbort = undefined;
      ctrl.abort();
      resetTobyMcpSession();
      const gap = tobySubmitGapMs();
      if (gap > 0) await sleep(gap);
    }
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
      model: tobyFlowVideoName(spec.id),
      aspect_ratio: opts.aspect,
    };
    if (opts.durationSeconds) args.duration = opts.durationSeconds;
    if (imageUrl) {
      args.image_url = imageUrl;
      args.refs = [imageUrl];
      args.images = [imageUrl];
      args.initial_frame = imageUrl;
    }
    const timeoutMs = tobyVideoTimeoutMs();
    const ctrl = new AbortController();
    inflightAbort = () => ctrl.abort();
    let submitted = false;
    const mcpPromise = tobyCallTool("gen_video", args, timeoutMs, ctrl.signal, () => {
      submitted = true;
      console.log(`[toby] gen_video enviado · ${tobyFlowVideoName(spec.id)}`);
    })
      .then((mcpResult) => pickRemote("video", mcpResult))
      .catch(async (err) => {
        if (!submitted || isTobySubmitFailure(err)) {
          await completeTobyResult(jobId, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          }).catch(() => undefined);
        }
        throw err;
      });
    let buf: Buffer;
    try {
      buf = await firstTobyBytes(jobId, mcpPromise, waitTobyResult(jobId, timeoutMs), () =>
        ctrl.abort(),
      );
    } finally {
      inflightAbort = undefined;
      ctrl.abort();
      resetTobyMcpSession();
      const gap = tobySubmitGapMs();
      if (gap > 0) await sleep(gap);
    }
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

export async function resetTobyPipeline(reason = "Toby reset"): Promise<void> {
  inflightAbort?.();
  await failAllTobyPending(reason).catch(() => undefined);
  resetTobyMcpSession();
  chain = Promise.resolve();
  tobyOwner = undefined;
  inflightAbort = undefined;
}

export function resetTobyLockForTests(): void {
  chain = Promise.resolve();
  tobyOwner = undefined;
  inflightAbort = undefined;
}
