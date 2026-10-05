import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: (...args: unknown[]) => mockExecFile(...args),
}));

import {
  applyKokoroEspeakFixups,
  normalizeEspeakNumerals,
  phonemizeForKokoro,
  splitKeepingPunctuation,
} from "./kokoro-espeak.js";

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

describe("normalizeEspeakNumerals", () => {
  it("strips US thousands commas so Spanish espeak will not say 'coma cero'", () => {
    expect(normalizeEspeakNumerals("más de 400,000 personas y 80,000 espectadores")).toBe(
      "más de 400000 personas y 80000 espectadores",
    );
    expect(normalizeEspeakNumerals("masacró 10,000 animales")).toBe("masacró 10000 animales");
  });

  it("strips European thousands dots (400.000 → 400000)", () => {
    expect(normalizeEspeakNumerals("más de 400.000 personas")).toBe("más de 400000 personas");
  });

  it("leaves Spanish decimals and plain integers alone", () => {
    expect(normalizeEspeakNumerals("mide 1,5 metros y tiene 80 trampillas")).toBe(
      "mide 1,5 metros y tiene 80 trampillas",
    );
    expect(normalizeEspeakNumerals("Durante 400 años")).toBe("Durante 400 años");
  });
});

describe("splitKeepingPunctuation", () => {
  it("keeps commas and periods as their own segments", () => {
    expect(splitKeepingPunctuation("Hola, mundo.")).toEqual([
      { punct: false, text: "Hola" },
      { punct: true, text: ", " },
      { punct: false, text: "mundo" },
      { punct: true, text: "." },
    ]);
  });
});

describe("phonemizeForKokoro", () => {
  beforeEach(() => {
    mockExecFile.mockReset();
  });

  it("uses system espeak-ng with Spanish voice, IPA ties, and applies fixups", async () => {
    mockExecFile.mockImplementation(
      (
        cmd: string,
        args: string[],
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        expect(cmd).toBe("espeak-ng");
        expect(args).toContain("es");
        expect(args).toContain("--ipa");
        expect(args).toContain("--tie=^");
        expect(args).not.toContain("--ipa=3");
        expect(args.at(-1)).toBe("Hola");
        cb(null, "ˈola", "");
      },
    );

    await expect(phonemizeForKokoro("Hola", "es")).resolves.toBe("ˈola");
  });

  it("phonemizes clauses separately and reinserts pause punctuation", async () => {
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        const chunk = args.at(-1) ?? "";
        cb(null, chunk === "Hola" ? "ˈola" : "mˈundo", "");
      },
    );

    await expect(phonemizeForKokoro("Hola, mundo.", "es")).resolves.toBe("ˈola, mˈundo.");
  });

  it("sends digit groups without thousand separators to espeak", async () => {
    const sent: string[] = [];
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        args: string[],
        _opts: object,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        sent.push(String(args.at(-1)));
        cb(null, "ipa", "");
      },
    );

    await phonemizeForKokoro("más de 400,000 personas.", "es");
    expect(sent.join(" ")).toContain("400000");
    expect(sent.join(" ")).not.toContain("400,000");
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
