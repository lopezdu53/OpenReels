import { execFileSync } from "node:child_process";
import * as fs from "node:fs";

/** Safari/iOS needs the moov atom before mdat or the player stays black. */
export const MP4_FASTSTART_ARGS = ["-movflags", "+faststart"] as const;

export type Mp4TopBoxes = { ftyp: number; moov: number; mdat: number };

function readBox(fd: number, off: number, fileSize: number): { type: string; size: number } | null {
  if (off + 8 > fileSize) return null;
  const hdr = Buffer.alloc(16);
  if (fs.readSync(fd, hdr, 0, 8, off) < 8) return null;
  let boxSize = hdr.readUInt32BE(0);
  const type = hdr.subarray(4, 8).toString("latin1");
  if (boxSize === 1) {
    if (off + 16 > fileSize) return null;
    if (fs.readSync(fd, hdr, 8, 8, off + 8) < 8) return null;
    const big = hdr.readBigUInt64BE(8);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    boxSize = Number(big);
    if (boxSize < 16) return null;
    return { type, size: boxSize };
  }
  if (boxSize === 0) boxSize = fileSize - off;
  if (boxSize < 8) return null;
  return { type, size: boxSize };
}

function markBox(found: Mp4TopBoxes, type: string, off: number): void {
  if (type === "ftyp" && found.ftyp < 0) found.ftyp = off;
  if (type === "moov" && found.moov < 0) found.moov = off;
  if (type === "mdat" && found.mdat < 0) found.mdat = off;
}

/** Byte offsets of top-level boxes; missing boxes are -1. */
export function mp4TopBoxes(filePath: string): Mp4TopBoxes {
  const found: Mp4TopBoxes = { ftyp: -1, moov: -1, mdat: -1 };
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, "r");
    const size = fs.fstatSync(fd).size;
    let off = 0;
    while (off + 8 <= size) {
      const box = readBox(fd, off, size);
      if (!box) break;
      markBox(found, box.type, off);
      if (found.moov >= 0 && found.mdat >= 0) break;
      off += box.size;
    }
  } catch {
    return found;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return found;
}

export function isMp4Faststart(filePath: string): boolean {
  const { moov, mdat } = mp4TopBoxes(filePath);
  if (moov < 0) return false;
  if (mdat < 0) return true;
  return moov < mdat;
}

export function remuxMp4Faststart(src: string, dest: string): void {
  const tmp = `${dest}.${process.pid}.faststart.mp4`;
  try {
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        src,
        "-c",
        "copy",
        "-map",
        "0",
        ...MP4_FASTSTART_ARGS,
        tmp,
      ],
      { stdio: "pipe" },
    );
    fs.renameSync(tmp, dest);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/** Remux in place the first time an mp4 is served so already-finished jobs play on iOS. */
export function ensureMp4Faststart(filePath: string): string {
  if (!filePath.toLowerCase().endsWith(".mp4")) return filePath;
  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).size < 32) return filePath;
    if (isMp4Faststart(filePath)) return filePath;
  } catch {
    return filePath;
  }
  const lock = `${filePath}.faststart.lock`;
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: "wx" });
  } catch {
    return filePath;
  }
  try {
    if (!isMp4Faststart(filePath)) remuxMp4Faststart(filePath, filePath);
  } catch (err) {
    console.warn("[mp4] faststart remux failed", filePath, err);
  } finally {
    try {
      fs.unlinkSync(lock);
    } catch {
      /* ignore */
    }
  }
  return filePath;
}
