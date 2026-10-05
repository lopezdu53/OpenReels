import { describe, expect, it } from "vitest";
import { extractMediaUrls } from "./extract.js";

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
});
