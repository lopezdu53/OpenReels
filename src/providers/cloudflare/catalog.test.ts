import { describe, expect, it } from "vitest";
import { cloudflareRunUrl } from "./client.js";
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

describe("cloudflareRunUrl encoding", () => {
  it("does not flatten @cf model slashes (No route for that URI)", () => {
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acct";
    const url = cloudflareRunUrl("@cf/meta/llama-3.1-8b-instruct-fp8-fast");
    expect(url).toContain("/ai/run/%40cf/meta/llama-3.1-8b-instruct-fp8-fast");
    expect(url).not.toContain("%2F");
  });
});
