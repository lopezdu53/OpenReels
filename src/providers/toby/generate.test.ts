import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTobyImage, resetTobyLockForTests } from "./generate.js";
import { resetTobyInboxForTests } from "./inbox.js";
import { resetTobyMcpSessionForTests } from "./mcp.js";

vi.mock("./mcp.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mcp.js")>();
  return {
    ...actual,
    tobyCallTool: vi.fn(async () => ({
      content: [{ type: "text", text: "https://cdn.example/still.png" }],
    })),
  };
});

const png = Buffer.concat([
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
  Buffer.alloc(1200),
]);

describe("Toby generate", () => {
  afterEach(() => {
    resetTobyInboxForTests();
    resetTobyMcpSessionForTests();
    resetTobyLockForTests();
    vi.unstubAllGlobals();
    delete process.env["TOBY_REDIS"];
  });

  it("downloads the MCP image URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("still.png")) {
          return new Response(png, { status: 200 });
        }
        return new Response("no", { status: 404 });
      }),
    );
    process.env["TOBY_REDIS"] = "0";
    const buf = await generateTobyImage({ prompt: "gato", aspect: "9:16", model: "Toby_nano-pro" });
    expect(buf.length).toBeGreaterThan(1000);
  });
});
