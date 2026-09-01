import { execFile } from "node:child_process";

/**
 * Misaki EspeakG2P mappings (hexgrad/kokoro non-English path).
 * eSpeak diphthongs/ties become the single-symbol alphabet Kokoro was trained on.
 */
const TIE_TO_KOKORO: [string, string][] = [
  ["a^ɪ", "I"],
  ["a͡ɪ", "I"],
  ["a_ɪ", "I"],
  ["a^ʊ", "W"],
  ["a͡ʊ", "W"],
  ["a_ʊ", "W"],
  ["d^z", "ʣ"],
  ["d͡z", "ʣ"],
  ["d^ʒ", "ʤ"],
  ["d͡ʒ", "ʤ"],
  ["e^ɪ", "A"],
  ["e͡ɪ", "A"],
  ["e_ɪ", "A"],
  ["o^ʊ", "O"],
  ["o͡ʊ", "O"],
  ["ə^ʊ", "Q"],
  ["ə͡ʊ", "Q"],
  ["s^s", "S"],
  ["t^s", "ʦ"],
  ["t͡s", "ʦ"],
  ["t^ʃ", "ʧ"],
  ["t͡ʃ", "ʧ"],
  ["ɔ^ɪ", "Y"],
  ["ɔ͡ɪ", "Y"],
];

export function prepareEspeakText(text: string): string {
  return text
    .replaceAll("«", "\u201C")
    .replaceAll("»", "\u201D")
    .replaceAll("(", "«")
    .replaceAll(")", "»");
}

export function applyKokoroEspeakFixups(ipa: string): string {
  let ps = ipa.trim();
  for (const [from, to] of TIE_TO_KOKORO) {
    ps = ps.replaceAll(from, to);
  }
  ps = ps.replaceAll("^", "").replaceAll("-", "");
  ps = ps.replaceAll("«", "(").replaceAll("»", ")");
  return ps.trim();
}

/**
 * IPA for a Kokoro non-English voice via system espeak-ng.
 * phonemizer.js (bundled by kokoro-js) only ships English voice data, so
 * passing "es" throws Invalid language identifier.
 */
export async function phonemizeForKokoro(text: string, lang: string): Promise<string> {
  const prepared = prepareEspeakText(text);
  const ipa = await new Promise<string>((resolve, reject) => {
    execFile(
      "espeak-ng",
      ["-q", "-b", "1", "--ipa=3", "-v", lang, "--", prepared],
      { timeout: 20_000, maxBuffer: 2 * 1024 * 1024, encoding: "utf8" },
      (err, stdout) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(String(stdout ?? "").trim());
      },
    );
  }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") {
      throw new Error(
        `Kokoro needs espeak-ng to phonemize "${lang}" (kokoro-js phonemizer is English-only). ` +
          "Install espeak-ng in the Docker image (apt install espeak-ng) and redeploy the worker.",
      );
    }
    throw err;
  });
  if (!ipa) {
    throw new Error(`espeak-ng produced no phonemes for lang=${lang}`);
  }
  return applyKokoroEspeakFixups(ipa);
}
