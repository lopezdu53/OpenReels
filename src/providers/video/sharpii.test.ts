import * as fs from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SharpiiVideo } from "./sharpii.js";

const fakeMp4 = Buffer.alloc(60_000, 1);

describe("SharpiiVideo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("submits I2V, polls the task, and writes the file", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/videos/generate")) {
        return new Response(JSON.stringify({ data: { task: { id: "task_1" } } }), { status: 202 });
      }
      if (url.includes("/tasks/task_1")) {
        return new Response(
          JSON.stringify({
            data: {
              status: "completed",
              outputs: [{ type: "video", url: "https://cdn.example/clip.mp4", duration_seconds: 5 }],
            },
          }),
          { status: 200 },
        );
      }
      if (url.includes("cdn.example")) return new Response(fakeMp4, { status: 200 });
      return new Response("no", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(globalThis, "setTimeout").mockImplementation((fn: TimerHandler) => {
      if (typeof fn === "function") fn();
      return 0 as unknown as NodeJS.Timeout;
    });

    const video = new SharpiiVideo("kling-v2.6-pro-i2v", "shp_test");
    expect(video.supportedDurations).toEqual([5, 10]);
    const result = await video.generate({
      sourceImage: Buffer.alloc(200, 2),
      prompt: "camera tracks the hero",
      durationSeconds: 5,
    });
    expect(result.durationSeconds).toBe(5);
    expect(fs.existsSync(result.filePath)).toBe(true);
    fs.unlinkSync(result.filePath);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.model).toBe("kling-v2.6-pro-i2v");
    expect(body.first_frame_url).toMatch(/^data:image\/png;base64,/);
    expect(body.audio_sync).toBe(false);
    expect(body.aspect_ratio).toBeUndefined();
  });
});
