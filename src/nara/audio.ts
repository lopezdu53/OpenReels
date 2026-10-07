import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export function isMpegAudio(buf: Buffer): boolean {
  if (buf.length < 3) return false;
  if (buf.toString("ascii", 0, 3) === "ID3") return true;
  return buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0;
}

export function transcodeToMp3(audio: Buffer): Buffer {
  if (isMpegAudio(audio) && audio.byteLength >= 400) return audio;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nara-mp3-"));
  const src = path.join(dir, "in.bin");
  const dest = path.join(dir, "out.mp3");
  fs.writeFileSync(src, audio);
  try {
    execFileSync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-codec:a", "libmp3lame", "-q:a", "2", dest],
      { stdio: "pipe" },
    );
    const out = fs.readFileSync(dest);
    if (out.byteLength < 200) throw new Error("ffmpeg produjo un MP3 vacío");
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
