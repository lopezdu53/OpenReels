import { afterEach, describe, expect, it, vi } from "vitest";
import { isLikenessConsentError, sharpiiGenerate } from "./client.js";

const consentError = {
  error: {
    type: "invalid_request_error",
    code: "invalid_field_type",
    message: "Please confirm you have the consent of the person depicted, appearing, or whose voice is used, before continuing.",
    param: "consent",
  },
};

describe("sharpiiGenerate likeness consent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("detects the Sharpii likeness-consent 400", () => {
    expect(isLikenessConsentError(consentError.error.message)).toBe(true);
    expect(isLikenessConsentError("duration_unsupported")).toBe(false);
  });

  it("sends consent: true and names the field on 400", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(consentError), { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sharpiiGenerate("shp_test", "/videos/generate", { model: "kling-v2.6-pro-i2v", prompt: "x" })).rejects.toThrow(
      /Sharpii 400 invalid_field_type \(consent\): Please confirm you have the consent/,
    );

    const first = JSON.parse(String(fetchMock.mock.calls[0]![1]?.body));
    expect(first.consent).toBe(true);
    const second = JSON.parse(String(fetchMock.mock.calls[1]![1]?.body));
    expect(second.has_consent).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });

  it("retries an alternate consent field after the first 400", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.has_consent === true) {
        return new Response(JSON.stringify({ data: { outputs: [{ url: "https://cdn.example/out.mp4" }] } }), {
          status: 200,
        });
      }
      return new Response(JSON.stringify(consentError), { status: 400 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const outputs = await sharpiiGenerate("shp_test", "/videos/generate", {
      model: "kling-v2.6-pro-i2v",
      prompt: "camera tracks the hero",
    });
    expect(outputs[0]?.url).toBe("https://cdn.example/out.mp4");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
