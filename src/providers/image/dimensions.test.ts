import { describe, expect, it, vi } from "vitest";
import {
  generateOrientedImage,
  isWideLandscape,
  landscapeRetryPrompt,
  pickWider,
  readImageSize,
} from "./dimensions.js";

function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf.writeUInt8(0x89, 0);
  buf.write("PNG\r\n\x1a\n", 1, "ascii");
  buf.writeUInt32BE(13, 8);
  buf.write("IHDR", 12, "ascii");
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function jpeg(width: number, height: number): Buffer {
  const buf = Buffer.alloc(20);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xc0;
  buf.writeUInt16BE(17, 4);
  buf[6] = 8;
  buf.writeUInt16BE(height, 7);
  buf.writeUInt16BE(width, 9);
  return buf;
}

describe("readImageSize", () => {
  it("reads PNG IHDR", () => {
    expect(readImageSize(png(1344, 768))).toEqual({ width: 1344, height: 768 });
    expect(readImageSize(png(768, 1344))).toEqual({ width: 768, height: 1344 });
  });

  it("reads JPEG SOF0", () => {
    expect(readImageSize(jpeg(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(readImageSize(jpeg(720, 1280))).toEqual({ width: 720, height: 1280 });
  });

  it("returns null for junk", () => {
    expect(readImageSize(Buffer.from("not-an-image"))).toBeNull();
  });
});

describe("isWideLandscape", () => {
  it("accepts 16:9 and rejects portrait or square", () => {
    expect(isWideLandscape({ width: 1344, height: 768 })).toBe(true);
    expect(isWideLandscape({ width: 1920, height: 1080 })).toBe(true);
    expect(isWideLandscape({ width: 768, height: 1344 })).toBe(false);
    expect(isWideLandscape({ width: 1024, height: 1024 })).toBe(false);
    expect(isWideLandscape(null)).toBe(false);
  });
});

describe("generateOrientedImage", () => {
  it("returns the first still when already 16:9", async () => {
    const landscape = png(1344, 768);
    const generate = vi.fn().mockResolvedValue(landscape);
    const out = await generateOrientedImage(generate, { prompt: "coati", aspectRatio: "16:9" });
    expect(out).toBe(landscape);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it("retries once when Film stills come out portrait", async () => {
    const portrait = png(768, 1344);
    const landscape = png(1344, 768);
    const generate = vi.fn().mockResolvedValueOnce(portrait).mockResolvedValueOnce(landscape);
    const out = await generateOrientedImage(generate, { prompt: "coati in the forest", aspectRatio: "16:9" });
    expect(out).toBe(landscape);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(String(generate.mock.calls[1]![0])).toContain("WIDE 16:9 HORIZONTAL");
    expect(String(generate.mock.calls[1]![0])).toContain("No black bars");
  });

  it("keeps the wider still if the retry is still portrait", async () => {
    const worse = png(512, 1024);
    const better = png(900, 1200);
    const generate = vi.fn().mockResolvedValueOnce(worse).mockResolvedValueOnce(better);
    const out = await generateOrientedImage(generate, { prompt: "scene", aspectRatio: "16:9" });
    expect(out).toBe(better);
  });

  it("does not retry Shorts (9:16)", async () => {
    const portrait = png(768, 1344);
    const generate = vi.fn().mockResolvedValue(portrait);
    const out = await generateOrientedImage(generate, { prompt: "hook", aspectRatio: "9:16" });
    expect(out).toBe(portrait);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("landscapeRetryPrompt", () => {
  it("forbids painted letterbox bars", () => {
    expect(landscapeRetryPrompt("a cub")).toMatch(/no letterboxing/i);
    expect(landscapeRetryPrompt("a cub")).toContain("a cub");
  });
});

describe("pickWider", () => {
  it("prefers the buffer with the larger width/height ratio", () => {
    const a = png(800, 800);
    const b = png(1280, 720);
    expect(pickWider(a, b)).toBe(b);
    expect(pickWider(b, a)).toBe(b);
  });
});
