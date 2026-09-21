import { describe, expect, it } from "vitest";
import { isIsolatedJobDir, isStickmanJobDirName, isVoxJobDirName } from "./isolated.js";

describe("isolated job dirs", () => {
  it("keeps Short/Film listings away from Vox and Stickman folders", () => {
    expect(isIsolatedJobDir("vox")).toBe(true);
    expect(isIsolatedJobDir("vox-8d6aff31")).toBe(true);
    expect(isIsolatedJobDir("stickman")).toBe(true);
    expect(isIsolatedJobDir("stickman-a1b2c3d4")).toBe(true);
    expect(isIsolatedJobDir("abc123")).toBe(false);
    expect(isIsolatedJobDir("25")).toBe(false);
  });

  it("does not treat stickman ids as vox ids", () => {
    expect(isVoxJobDirName("stickman-a1b2c3d4")).toBe(false);
    expect(isStickmanJobDirName("vox-8d6aff31")).toBe(false);
    expect(isStickmanJobDirName("stickman-a1b2c3d4")).toBe(true);
  });
});
