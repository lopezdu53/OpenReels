import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTobyImage, resetTobyLockForTests } from "./generate.js";
import { completeTobyFifo, resetTobyInboxForTests } from "./inbox.js";
import { resetTobyMcpSessionForTests, tobyCallTool } from "./mcp.js";

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
    delete process.env["TOBY_SUBMIT_GAP_MS"];
    vi.mocked(tobyCallTool).mockReset();
    vi.mocked(tobyCallTool).mockImplementation(async () => ({
      content: [{ type: "text", text: "https://cdn.example/still.png" }],
    }));
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
    process.env["TOBY_SUBMIT_GAP_MS"] = "0";
    const buf = await generateTobyImage({ prompt: "gato", aspect: "9:16", model: "Toby_nano-pro" });
    expect(buf.length).toBeGreaterThan(1000);
    expect(vi.mocked(tobyCallTool)).toHaveBeenCalledWith(
      "gen_image",
      expect.objectContaining({
        provider: "flow",
        model: "Nano Banana Pro",
        aspect_ratio: "9:16",
      }),
      expect.any(Number),
      expect.any(AbortSignal),
    );
  });

  it("takes the Windows inbox file while MCP is still open", async () => {
    process.env["TOBY_REDIS"] = "0";
    process.env["TOBY_SUBMIT_GAP_MS"] = "0";
    vi.mocked(tobyCallTool).mockImplementation(() => new Promise(() => {}));
    const pending = generateTobyImage({ prompt: "ciudad", aspect: "9:16", model: "Toby_nano-pro" });
    await new Promise((r) => setTimeout(r, 40));
    const matched = await completeTobyFifo("image", { ok: true, bytes: png.toString("base64") });
    expect(matched).toBeTruthy();
    const buf = await pending;
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("frees the MCP slot so the next still can submit", async () => {
    process.env["TOBY_REDIS"] = "0";
    process.env["TOBY_SUBMIT_GAP_MS"] = "0";
    vi.mocked(tobyCallTool)
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockImplementationOnce(async () => ({
        content: [{ type: "text", text: "https://cdn.example/still.png" }],
      }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("still.png")) return new Response(png, { status: 200 });
        return new Response("no", { status: 404 });
      }),
    );
    const first = generateTobyImage({ prompt: "uno", aspect: "9:16", model: "Toby_nano-pro" });
    await new Promise((r) => setTimeout(r, 40));
    await completeTobyFifo("image", { ok: true, bytes: png.toString("base64") });
    await first;
    const second = await generateTobyImage({ prompt: "dos", aspect: "9:16", model: "Toby_nano-pro" });
    expect(second.length).toBeGreaterThan(1000);
    expect(vi.mocked(tobyCallTool)).toHaveBeenCalledTimes(2);
  });
});
