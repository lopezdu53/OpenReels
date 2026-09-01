import { afterEach, describe, expect, it, vi } from "vitest";
import { extractMediaBuffer, isRunPodRetryable } from "./client.js";

describe("extractMediaBuffer", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads image_url from the completed payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array(16).buffer,
      }),
    );

    const buf = await extractMediaBuffer(
      { image_url: "https://image.runpod.ai/abc/out.png", cost: 0.002 },
      "image",
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf?.length).toBe(16);
  });

  it("decodes nested base64 image data", async () => {
    const payload = Buffer.from("fake-png-bytes").toString("base64");
    const buf = await extractMediaBuffer({ output: { image: payload } }, "image");
    expect(buf?.toString()).toBe("fake-png-bytes");
  });

  it("downloads WaveSpeed-style result URLs from Flux Schnell", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new Uint8Array(32).buffer,
    });
    vi.stubGlobal("fetch", fetchMock);

    const buf = await extractMediaBuffer(
      {
        cost: 0.003,
        result: "https://image.runpod.ai/wavespeed-flux-schnell/abc/result.png",
      },
      "image",
    );
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf?.length).toBe(32);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://image.runpod.ai/wavespeed-flux-schnell/abc/result.png",
    );
  });

  it("downloads a result URL nested under output", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new Uint8Array(8).buffer,
      }),
    );

    const buf = await extractMediaBuffer(
      { output: { result: "https://video.runpod.ai/p-video/out.mp4", cost: 0.1 } },
      "video",
    );
    expect(buf?.length).toBe(8);
  });
});

describe("isRunPodRetryable", () => {
  it("retries on 429 and network errors", () => {
    expect(isRunPodRetryable(new Error("429 Too Many Requests"))).toBe(true);
    expect(isRunPodRetryable(new Error("fetch failed"))).toBe(true);
    expect(isRunPodRetryable(new Error("invalid prompt"))).toBe(false);
  });
});
