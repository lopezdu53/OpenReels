import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../atlas/client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../atlas/client.js")>();
  return {
    ...actual,
    generateImage: vi.fn().mockResolvedValue("https://cdn.example/out.png"),
    downloadUrl: vi.fn().mockResolvedValue(Buffer.from("x".repeat(2000))),
    toDataUri: (buf: Buffer) => `data:image/png;base64,${buf.toString("base64")}`,
  };
});

import { downloadUrl, generateImage } from "../atlas/client.js";
import { AtlasImage } from "./atlas.js";

describe("AtlasImage", () => {
  const origKey = process.env["ATLASCLOUD_API_KEY"];

  beforeEach(() => {
    process.env["ATLASCLOUD_API_KEY"] = "test-atlas-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (origKey !== undefined) process.env["ATLASCLOUD_API_KEY"] = origKey;
    else delete process.env["ATLASCLOUD_API_KEY"];
  });

  it("throws without key", () => {
    delete process.env["ATLASCLOUD_API_KEY"];
    expect(() => new AtlasImage()).toThrow("ATLASCLOUD_API_KEY");
  });

  it("uses nano-banana-2-lite text-to-image", async () => {
    const img = new AtlasImage();
    await img.generate("a red car", undefined, undefined, "9:16");
    expect(generateImage).toHaveBeenCalledWith(
      "test-atlas-key",
      "google/nano-banana-2-lite/text-to-image",
      expect.stringContaining("a red car"),
      expect.objectContaining({ aspect_ratio: "9:16" }),
    );
    expect(downloadUrl).toHaveBeenCalled();
  });

  it("switches to the edit model when a reference still is present", async () => {
    const img = new AtlasImage();
    await img.generate("same person", undefined, Buffer.alloc(200, 1), "9:16");
    expect(generateImage).toHaveBeenCalledWith(
      "test-atlas-key",
      "google/nano-banana-2-lite/edit",
      expect.any(String),
      expect.objectContaining({ images: [expect.stringContaining("data:image/png;base64,")] }),
    );
  });
});
