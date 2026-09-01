import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("kokoro-worker ONNX isolation", () => {
  it("does not import the app's @huggingface/transformers (ORT 1.24 clash)", () => {
    const src = readFileSync(new URL("./kokoro-worker.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/import\(["']@huggingface\/transformers["']\)/);
  });

  it("resolves kokoro-js transformers to v3, not the app v4", () => {
    const require = createRequire(fileURLToPath(import.meta.url));
    const fromKokoro = createRequire(require.resolve("kokoro-js"));
    const fromWorker = createRequire(fileURLToPath(import.meta.url));
    const kokoroTf = fromKokoro.resolve("@huggingface/transformers");
    const appTf = fromWorker.resolve("@huggingface/transformers");
    expect(kokoroTf).toMatch(/transformers@3/);
    expect(appTf).toMatch(/transformers@4/);
    expect(kokoroTf).not.toBe(appTf);
  });
});
