import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("kokoro-worker ONNX isolation", () => {
  it("does not import @huggingface/transformers (ORT 1.21 vs 1.24 clash)", () => {
    const src = readFileSync(new URL("./kokoro-worker.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/from ["']@huggingface\/transformers["']/);
    expect(src).not.toMatch(/import\(["']@huggingface\/transformers["']\)/);
    expect(src).toContain("tensorCtorOf");
  });
});
