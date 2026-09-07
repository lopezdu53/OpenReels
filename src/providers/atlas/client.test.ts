import { afterEach, describe, expect, it, vi } from "vitest";
import { ATLAS_MEDIA_BASE, ATLAS_USER_AGENT } from "./catalog.js";
import { atlasHeaders, atlasPost, predictionId, toDataUri } from "./client.js";

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
});
