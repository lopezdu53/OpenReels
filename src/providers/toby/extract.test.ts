import { describe, expect, it } from "vitest";
import { extractMcpBuffers, extractMediaUrls } from "./extract.js";

describe("Toby MCP extract", () => {
  it("finds image and video URLs in nested MCP content", () => {
    const found = extractMediaUrls({
      content: [
        { type: "text", text: "done https://cdn.example/a.png and https://cdn.example/b.mp4" },
      ],
    });
    expect(found.images.some((u) => u.includes("a.png"))).toBe(true);
    expect(found.videos.some((u) => u.includes("b.mp4"))).toBe(true);
  });

  it("reads MCP image content blocks without a URL", () => {
    const png = Buffer.concat([
      Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"),
      Buffer.alloc(900),
    ]);
    const found = extractMcpBuffers(
      { content: [{ type: "image", mimeType: "image/png", data: png.toString("base64") }] },
      "image",
    );
    expect(found[0]?.length).toBeGreaterThan(800);
  });
});
