import { describe, expect, it } from "vitest";
import { CloudflareLLM } from "../providers/llm/cloudflare.js";
import { createHistoriaLlm } from "./llm.js";

describe("createHistoriaLlm", () => {
  it("defaults to Cloudflare Workers AI", () => {
    const prev = process.env["CLOUDFLARE_API_TOKEN"];
    process.env["CLOUDFLARE_API_TOKEN"] = "test-token";
    process.env["CLOUDFLARE_ACCOUNT_ID"] = "acc";
    try {
      expect(createHistoriaLlm()).toBeInstanceOf(CloudflareLLM);
    } finally {
      if (prev !== undefined) process.env["CLOUDFLARE_API_TOKEN"] = prev;
      else delete process.env["CLOUDFLARE_API_TOKEN"];
    }
  });
});
