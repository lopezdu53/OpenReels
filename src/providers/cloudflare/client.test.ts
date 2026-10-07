import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudflareRun, cloudflareRunUrl } from "./client.js";

describe("cloudflareRunUrl", () => {
  it("encodes slashes in @cf model ids", () => {
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct";
    expect(cloudflareRunUrl("@cf/black-forest-labs/flux-1-schnell")).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct/ai/run/%40cf%2Fblack-forest-labs%2Fflux-1-schnell",
    );
  });
});

describe("cloudflareRun", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends JSON by default and FormData when multipart is set", async () => {
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct";
    process.env["CLOUDFLARE_API_TOKEN"] = "tok";
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => {
      return new Response(
        JSON.stringify({ success: true, result: { image: Buffer.alloc(900, 1).toString("base64") } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await cloudflareRun("@cf/black-forest-labs/flux-1-schnell", { prompt: "cat" });
    const firstHeaders = (fetchMock.mock.calls[0]?.[1] as RequestInit)?.headers as Record<string, string>;
    expect(firstHeaders["Content-Type"]).toBe("application/json");

    await cloudflareRun("@cf/black-forest-labs/flux-2-klein-4b", { prompt: "dog", width: 1024 }, { multipart: true });
    const second = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(second.body).toBeInstanceOf(FormData);
  });
});
