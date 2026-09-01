import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

import { applyKokoroEspeakFixups, phonemizeForKokoro } from "./kokoro-espeak.js";

describe("applyKokoroEspeakFixups", () => {
  it("maps eSpeak diphthong ties to Kokoro symbols", () => {
    expect(applyKokoroEspeakFixups("t^ʃa")).toBe("ʧa");
    expect(applyKokoroEspeakFixups("a^ɪ")).toBe("I");
    expect(applyKokoroEspeakFixups("e͡ɪ")).toBe("A");
  });

  it("strips leftover ties and hyphens and restores parentheses", () => {
    expect(applyKokoroEspeakFixups("foo^bar-baz «x»")).toBe("foobarbaz (x)");
  });
});

describe("phonemizeForKokoro", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it("uses system espeak-ng with Spanish voice and applies fixups", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        expect(cmd).toBe("espeak-ng");
        expect(args).toContain("es");
        expect(args).toContain("--ipa=3");
        expect(args.at(-1)).toBe("Hola");
        cb(null, "ˈola", "");
      },
    );

    await expect(phonemizeForKokoro("Hola", "es")).resolves.toBe("ˈola");
  });

  it("explains how to fix a missing espeak-ng binary", async () => {
    const missing = Object.assign(new Error("not found"), { code: "ENOENT" });
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => cb(missing, "", ""),
    );

    await expect(phonemizeForKokoro("Hola", "es")).rejects.toThrow(/apt install espeak-ng/);
  });
});
