import * as fs from "node:fs";
import * as path from "node:path";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ensureMp4Faststart } from "../media/mp4-faststart.js";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
};

export type ArtifactRange =
  | { ok: true; start: number; end: number }
  | { ok: false; unsatisfiable: true }
  | { ok: false; unsatisfiable: false };

/** Safari/iOS always probes mp4 with Range. A 200 without Accept-Ranges looks like a broken player. */
export function parseByteRange(header: string | undefined, size: number): ArtifactRange {
  if (!header || size <= 0) return { ok: false, unsatisfiable: false };
  const m = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!m) return { ok: false, unsatisfiable: true };
  const from = m[1] ?? "";
  const to = m[2] ?? "";
  if (!from && !to) return { ok: false, unsatisfiable: true };
  if (!from) {
    const suffix = Number(to);
    if (!Number.isFinite(suffix) || suffix <= 0) return { ok: false, unsatisfiable: true };
    return { ok: true, start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(from);
  const end = to === "" ? size - 1 : Number(to);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return { ok: false, unsatisfiable: true };
  }
  return { ok: true, start, end: Math.min(end, size - 1) };
}

export function sendArtifact(
  request: FastifyRequest,
  reply: FastifyReply,
  filePath: string,
): FastifyReply {
  const ext = path.extname(filePath).toLowerCase();
  const servePath = ext === ".mp4" ? ensureMp4Faststart(filePath) : filePath;
  const stat = fs.statSync(servePath);
  reply.header("Content-Type", TYPES[ext] ?? "application/octet-stream");
  reply.header("Accept-Ranges", "bytes");
  reply.header("Cache-Control", "private, max-age=120");
  if (ext === ".mp4") {
    reply.header("Content-Disposition", `inline; filename="${path.basename(filePath)}"`);
  }
  const raw = request.headers.range;
  const header = Array.isArray(raw) ? raw[0] : raw;
  const range = parseByteRange(header, stat.size);
  if (range.ok) {
    const length = range.end - range.start + 1;
    reply.code(206);
    reply.header("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
    reply.header("Content-Length", String(length));
    return reply.send(fs.createReadStream(servePath, { start: range.start, end: range.end }));
  }
  if (range.unsatisfiable) {
    reply.code(416);
    reply.header("Content-Range", `bytes */${stat.size}`);
    return reply.send();
  }
  reply.header("Content-Length", String(stat.size));
  return reply.send(fs.createReadStream(servePath));
}
