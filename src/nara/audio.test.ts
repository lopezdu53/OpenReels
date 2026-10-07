import { describe, expect, it } from "vitest";
import { isMpegAudio } from "./audio.js";

describe("nara audio", () => {
  it("detects ID3 and MPEG frame headers", () => {
    expect(isMpegAudio(Buffer.from("ID3...."))).toBe(true);
    expect(isMpegAudio(Buffer.from([0xff, 0xfb, 0x90, 0x00]))).toBe(true);
    expect(isMpegAudio(Buffer.from("RIFF"))).toBe(false);
  });
});
