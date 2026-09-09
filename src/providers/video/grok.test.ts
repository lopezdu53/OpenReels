import * as fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrokVideo } from "./grok.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GrokVideo", () => {
  const origKey = process.env["XAI_API_KEY"];

  beforeEach(() => {
    process.env["XAI_API_KEY"] = "test-xai-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (origKey !== undefined) process.env["XAI_API_KEY"] = origKey;
    else delete process.env["XAI_API_KEY"];
  });

  it("throws without XAI_API_KEY", () => {
    delete process.env["XAI_API_KEY"];
    expect(() => new GrokVideo()).toThrow("XAI_API_KEY environment variable is required");
  });

  it("submits grok-imagine-video-1.5 and polls until done", async () => {
    vi.useFakeTimers();
    const videoBytes = Buffer.alloc(60_000, 1);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ request_id: "req-1" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "pending", progress: 10 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "done",
          video: { url: "https://cdn.x.ai/clip.mp4", duration: 8 },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => videoBytes.buffer,
      });

    const provider = new GrokVideo("test-xai-key");
    const pending = provider.generate({
      sourceImage: Buffer.from("fake-png"),
      prompt: "slow push in",
      durationSeconds: 8,
    });
    await vi.advanceTimersByTimeAsync(12_000);
    const result = await pending;
    vi.useRealTimers();

    const submitBody = JSON.parse(
      (mockFetch.mock.calls[0] as [string, { body: string }])[1].body,
    ) as { model: string; duration: number };
    expect(submitBody.model).toBe("grok-imagine-video-1.5");
    expect(submitBody.duration).toBe(8);
    expect(result.durationSeconds).toBe(8);
    expect(result.filePath).toContain("openreels-grok-");
    if (fs.existsSync(result.filePath)) fs.unlinkSync(result.filePath);
  });

  it("fails on expired status", async () => {
    vi.useFakeTimers();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ request_id: "req-2" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "expired", error: { message: "request expired" } }),
      });

    const pending = new GrokVideo("k").generate({ sourceImage: Buffer.from("x"), prompt: "go" });
    const assertion = expect(pending).rejects.toThrow("expired");
    await vi.advanceTimersByTimeAsync(6_000);
    await assertion;
    vi.useRealTimers();
  });
});
