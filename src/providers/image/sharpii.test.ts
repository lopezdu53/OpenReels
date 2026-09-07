import { afterEach, describe, expect, it, vi } from "vitest";
import { SharpiiImage } from "./sharpii.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("SharpiiImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("posts a sync generate and downloads the PNG", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/images/generate")) {
        return new Response(
          JSON.stringify({ data: { outputs: [{ type: "image", url: "https://cdn.example/out.png" }] } }),
          { status: 200 },
        );
      }
      if (url.includes("cdn.example")) {
        return new Response(png, { status: 200 });
      }
      return new Response("no", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const img = new SharpiiImage("nano-banana-2", "shp_test");
    const buf = await img.generate("a red car", undefined, undefined, "16:9");
    expect(buf.equals(png)).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.model).toBe("nano-banana-2");
    expect(body.aspect_ratio).toBe("16:9");
    expect(body.reference_images).toBeUndefined();
  });

  it("sends a data-URI reference on Nano Banana", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/images/generate")) {
        return new Response(JSON.stringify({ data: { outputs: [{ url: "https://cdn.example/out.png" }] } }), {
          status: 200,
        });
      }
      return new Response(png, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const img = new SharpiiImage("nano-banana-2", "shp_test");
    await img.generate("same person", undefined, Buffer.alloc(120, 7), "16:9");
    const body = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(body.reference_images[0]).toMatch(/^data:image\/png;base64,/);
  });
});
