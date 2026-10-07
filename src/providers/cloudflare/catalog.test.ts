import { describe, expect, it } from "vitest";
import {
  cloudflareImageUsd,
  cloudflareLlmPricing,
  cloudflareTtsPer1kChars,
  DEFAULT_CLOUDFLARE_IMAGE,
  DEFAULT_CLOUDFLARE_LLM,
  resolveCloudflareImage,
  resolveCloudflareLlm,
  resolveCloudflareTts,
} from "./catalog.js";

describe("Cloudflare Workers AI catalog", () => {
  it("prices Llama 3.1 8B Fast and FLUX Schnell from public list rates", () => {
    const llm = cloudflareLlmPricing(DEFAULT_CLOUDFLARE_LLM);
    expect(llm.perInputToken).toBeCloseTo(0.045 / 1_000_000);
    expect(llm.perOutputToken).toBeCloseTo(0.384 / 1_000_000);
    expect(cloudflareImageUsd(DEFAULT_CLOUDFLARE_IMAGE)).toBeCloseTo(0.00085);
    expect(cloudflareTtsPer1kChars("@cf/deepgram/aura-2-es")).toBeCloseTo(0.03);
  });

  it("resolves known ids and falls back to defaults", () => {
    expect(resolveCloudflareLlm("@cf/zai-org/glm-4.7-flash")).toBe("@cf/zai-org/glm-4.7-flash");
    expect(resolveCloudflareLlm("nope")).toBe(DEFAULT_CLOUDFLARE_LLM);
    expect(resolveCloudflareImage("nope")).toBe(DEFAULT_CLOUDFLARE_IMAGE);
    expect(resolveCloudflareTts("@cf/deepgram/aura-1")).toBe("@cf/deepgram/aura-1");
  });
});
