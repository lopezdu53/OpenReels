import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrokImage } from "./grok.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GrokImage", () => {
  const origKey = process.env["XAI_API_KEY"];

  beforeEach(() => {
    process.env["XAI_API_KEY"] = "test-xai-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (origKey !== undefined) process.env["XAI_API_KEY"] = origKey;
    else delete process.env["XAI_API_KEY"];
  });

  it("throws without XAI_API_KEY", () => {
    delete process.env["XAI_API_KEY"];
    expect(() => new GrokImage()).toThrow("XAI_API_KEY environment variable is required");
  });

  it("posts to images/generations with 9:16 and grok-imagine-image-2.0", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }] }),
    });

    const img = new GrokImage();
    const buf = await img.generate("a neon puppy");
    expect(buf.toString()).toBe("png-bytes");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.x.ai/v1/images/generations",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((mockFetch.mock.calls[0] as [string, { body: string }])[1].body) as {
      model: string;
      aspect_ratio: string;
    };
    expect(body.model).toBe("grok-imagine-image-2.0");
    expect(body.aspect_ratio).toBe("9:16");
  });

  it("uses edits endpoint when a reference image is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: Buffer.from("edited").toString("base64") }] }),
    });

    await new GrokImage().generate("same puppy, new scene", undefined, Buffer.from("ref"), "16:9");
    expect(mockFetch.mock.calls[0]?.[0]).toBe("https://api.x.ai/v1/images/edits");
    const body = JSON.parse((mockFetch.mock.calls[0] as [string, { body: string }])[1].body) as {
      aspect_ratio: string;
      image: { type: string };
    };
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.image.type).toBe("image_url");
  });

  it("downloads URL responses", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ url: "https://cdn.x.ai/img.png" }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from("downloaded-image-bytes-ok").buffer,
      });

    const buf = await new GrokImage().generate("city");
    expect(buf.toString()).toContain("downloaded-image");
  });
});
