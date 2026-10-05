import { describe, expect, it } from "vitest";
import { parseByteRange } from "./send-artifact.js";

describe("parseByteRange", () => {
  it("returns full file when Safari sends no Range", () => {
    expect(parseByteRange(undefined, 1000)).toEqual({ ok: false, unsatisfiable: false });
  });

  it("handles the iOS probe Range: bytes=0-1", () => {
    expect(parseByteRange("bytes=0-1", 2_500_000)).toEqual({ ok: true, start: 0, end: 1 });
  });

  it("handles open-ended bytes=0-", () => {
    expect(parseByteRange("bytes=0-", 100)).toEqual({ ok: true, start: 0, end: 99 });
  });

  it("handles suffix bytes=-10", () => {
    expect(parseByteRange("bytes=-10", 100)).toEqual({ ok: true, start: 90, end: 99 });
  });

  it("rejects a start past EOF as unsatisfiable", () => {
    expect(parseByteRange("bytes=500-600", 100)).toEqual({ ok: false, unsatisfiable: true });
  });
});
