import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isTransientVisualError, writeHeldStill } from "./hold-frame.js";

describe("isTransientVisualError", () => {
  it("retries Atlas timeouts and 5xx", () => {
    expect(isTransientVisualError(new Error("Atlas abc timed out after 180s"))).toBe(true);
    expect(isTransientVisualError("Atlas 503 /model/generateImage: overloaded")).toBe(true);
    expect(isTransientVisualError("safety filter")).toBe(false);
  });
});

describe("writeHeldStill", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  it("writes the previous still as this scene's PNG", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hold-"));
    dirs.push(dir);
    const prev = Buffer.from("held-frame");
    const file = writeHeldStill(dir, 2, prev);
    expect(file).toBe(path.join(dir, "scene-2-ai.png"));
    expect(fs.readFileSync(file)).toEqual(prev);
  });
});
