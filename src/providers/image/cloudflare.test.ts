import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudflareImage, cloudflareImageSize } from "./cloudflare.js";

describe("CloudflareImage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env["CLOUDFLARE_ACCOUNT_ID"];
    delete process.env["CLOUDFLARE_API_TOKEN"];
  });

  it("maps 9:16 / 16:9 sizes", () => {
    expect(cloudflareImageSize("9:16")).toEqual({ width: 768, height: 1344 });
    expect(cloudflareImageSize("16:9")).toEqual({ width: 1344, height: 768 });
  });

  it("retries Schnell as multipart when Workers AI asks for multipart", async () => {
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct";
    process.env["CLOUDFLARE_API_TOKEN"] = "tok";
    const jpegB64 = Buffer.alloc(900, 7).toString("base64");
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        n += 1;
        if (n === 1) {
          expect(init?.body).toBeTypeOf("string");
          return new Response(
            JSON.stringify({
              success: false,
              errors: [{ message: "required properties at '/' are 'multipart'" }],
            }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        expect(init?.body).toBeInstanceOf(FormData);
        return new Response(JSON.stringify({ success: true, result: { image: jpegB64 } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }),
    );

    const img = new CloudflareImage("@cf/black-forest-labs/flux-1-schnell", "tok");
    const buf = await img.generate("a cat", undefined, undefined, "9:16");
    expect(buf.length).toBeGreaterThan(800);
    expect(n).toBe(2);
  });
});
