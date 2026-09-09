import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

vi.mock("../atlas/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../atlas/client.js")>();
  return {
    ...actual,
    generateVideo: vi.fn().mockResolvedValue("https://cdn.example/out.mp4"),
    downloadUrl: vi.fn().mockResolvedValue(Buffer.alloc(60_000, 1)),
    toDataUri: (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`,
    uploadBuffer: vi.fn().mockResolvedValue("https://cdn.example/uploaded"),
  };
});

import { generateVideo, uploadBuffer } from "../atlas/client.js";
import { AtlasVideo } from "./atlas.js";

describe("AtlasVideo", () => {
  const origKey = process.env["ATLASCLOUD_API_KEY"];

  beforeEach(() => {
    process.env["ATLASCLOUD_API_KEY"] = "test-atlas-key";
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (origKey !== undefined) process.env["ATLASCLOUD_API_KEY"] = origKey;
    else delete process.env["ATLASCLOUD_API_KEY"];
  });

  it("throws without key", () => {
    delete process.env["ATLASCLOUD_API_KEY"];
    expect(() => new AtlasVideo()).toThrow("ATLASCLOUD_API_KEY");
  });

  it("submits Seedance Mini I2V then VEED lipsync when audio is present", async () => {
    const video = new AtlasVideo();
    const result = await video.generate({
      sourceImage: Buffer.alloc(100, 2),
      prompt: "walks forward",
      durationSeconds: 5,
      aspectRatio: "9:16",
      audio: Buffer.alloc(200, 3),
    });
    expect(generateVideo).toHaveBeenNthCalledWith(
      1,
      "test-atlas-key",
      "bytedance/seedance-2.0-mini/image-to-video",
      expect.objectContaining({ duration: 5, generate_audio: false }),
    );
    expect(uploadBuffer).toHaveBeenCalled();
    expect(generateVideo).toHaveBeenNthCalledWith(
      2,
      "test-atlas-key",
      "veed/lipsync",
      expect.objectContaining({ video_url: expect.any(String), audio_url: expect.any(String) }),
    );
    expect(result.durationSeconds).toBe(5);
    await fsp.unlink(result.filePath).catch(() => {});
  });

  it("uses image+audio lips instead of I2V when InfiniteTalk is the lip model", async () => {
    const video = new AtlasVideo(undefined, undefined, "atlascloud/infinitetalk");
    const result = await video.generate({
      sourceImage: Buffer.alloc(100, 2),
      prompt: "talks to camera",
      durationSeconds: 5,
      audio: Buffer.alloc(200, 3),
    });
    expect(generateVideo).toHaveBeenCalledTimes(1);
    expect(generateVideo).toHaveBeenCalledWith(
      "test-atlas-key",
      "atlascloud/infinitetalk",
      expect.objectContaining({ audio: expect.any(String), image: expect.any(String) }),
    );
    await fsp.unlink(result.filePath).catch(() => {});
  });

  it("skips lipsync when disabled", async () => {
    const video = new AtlasVideo(undefined, undefined, null);
    const result = await video.generate({
      sourceImage: Buffer.alloc(100, 2),
      prompt: "walks forward",
      durationSeconds: 5,
    });
    expect(generateVideo).toHaveBeenCalledTimes(1);
    await fsp.unlink(result.filePath).catch(() => {});
    expect(path.dirname(result.filePath)).toBe(os.tmpdir());
  });
});
