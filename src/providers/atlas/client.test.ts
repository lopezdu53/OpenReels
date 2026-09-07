import { afterEach, describe, expect, it, vi } from "vitest";
import { ATLAS_MEDIA_BASE, ATLAS_USER_AGENT } from "./catalog.js";
import {
  ATLAS_INVALID_KEY_MESSAGE,
  atlasHeaders,
  atlasPost,
  predictionId,
  resolveAtlasApiKey,
  rewriteAtlasAuthError,
  sanitizeAtlasApiKey,
  toDataUri,
} from "./client.js";

describe("atlas key sanitizer", () => {
  const orig = process.env["ATLASCLOUD_API_KEY"];

  afterEach(() => {
    if (orig !== undefined) process.env["ATLASCLOUD_API_KEY"] = orig;
    else delete process.env["ATLASCLOUD_API_KEY"];
  });

  it("strips whitespace, quotes, and NAME=value pasted into the value field", () => {
    expect(sanitizeAtlasApiKey("  apikey-abc  ")).toBe("apikey-abc");
    expect(sanitizeAtlasApiKey('"apikey-abc"')).toBe("apikey-abc");
    expect(sanitizeAtlasApiKey("ATLASCLOUD_API_KEY=apikey-abc")).toBe("apikey-abc");
    expect(sanitizeAtlasApiKey('ATLASCLOUD_API_KEY="apikey-abc"')).toBe("apikey-abc");
    expect(sanitizeAtlasApiKey("")).toBeUndefined();
    expect(sanitizeAtlasApiKey("   ")).toBeUndefined();
  });

  it("falls back to env when BYOK is empty", () => {
    process.env["ATLASCLOUD_API_KEY"] = "env-atlas-key";
    expect(resolveAtlasApiKey("")).toBe("env-atlas-key");
    expect(resolveAtlasApiKey(undefined)).toBe("env-atlas-key");
    expect(resolveAtlasApiKey("  ")).toBe("env-atlas-key");
  });

  it("rewrites 401-style LLM errors", () => {
    expect(rewriteAtlasAuthError(new Error("API key is invalid.")).message).toBe(ATLAS_INVALID_KEY_MESSAGE);
    expect(rewriteAtlasAuthError(new Error("boom")).message).toBe("boom");
  });
});

describe("atlas client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends a real User-Agent (Atlas WAF blocks default fetch UA)", () => {
    const h = atlasHeaders("sk-test");
    expect(h["User-Agent"]).toBe(ATLAS_USER_AGENT);
    expect(h.Authorization).toBe("Bearer sk-test");
  });

  it("encodes buffers as data URIs", () => {
    expect(toDataUri(Buffer.from("hi"), "image/png")).toBe("data:image/png;base64,aGk=");
  });

  it("extracts prediction id from the media envelope", () => {
    expect(predictionId({ data: { id: "pred-1" } })).toBe("pred-1");
    expect(() => predictionId({})).toThrow(/no prediction id/);
  });

  it("POSTs JSON to the media API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ data: { id: "abc" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const json = await atlasPost("sk-test", "/model/generateImage", { model: "x", prompt: "p" });
    expect(json).toEqual({ data: { id: "abc" } });
    expect(fetchMock).toHaveBeenCalledWith(
      `${ATLAS_MEDIA_BASE}/model/generateImage`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "User-Agent": ATLAS_USER_AGENT }),
      }),
    );
  });

  it("rewrites 401 media errors to the EasyPanel key hint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ message: "API key is invalid." }),
      }),
    );
    await expect(atlasPost("bad", "/model/generateImage", { model: "x", prompt: "p" })).rejects.toThrow(
      ATLAS_INVALID_KEY_MESSAGE,
    );
  });
});
