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

/** Same punctuation class kokoro-js keeps as pause tokens (not sent to eSpeak). */
const PUNCT_CHARS = ";:,.!?¡¿—…\"«»“”(){}[]'";

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
  ps = ps.replaceAll("^", "").replaceAll("\u200D", "").replaceAll("-", "");
  ps = ps.replaceAll("«", "(").replaceAll("»", ")");
  return ps.replace(/\s+/g, " ").trim();
}

/**
 * Strip thousand separators so espeak-ng reads quantities as words.
 * Spanish treats `,` as decimal ("400,000" → "cuatrocientos coma cero…")
 * and `.` as thousands ("400.000" → "cuatrocientos mil").
 * Leaves true decimals like "1,5" alone (not groups of three).
 */
export function normalizeEspeakNumerals(text: string): string {
  return text
    .replace(/\d{1,3}(?:,\d{3})+\b/g, (m) => m.replaceAll(",", ""))
    .replace(/\d{1,3}(?:\.\d{3})+\b/g, (m) => m.replaceAll(".", ""));
}

export function splitKeepingPunctuation(text: string): { punct: boolean; text: string }[] {
  const escaped = PUNCT_CHARS.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(\\s*[${escaped}]+\\s*)+`, "g");
  const parts: { punct: boolean; text: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(re)) {
    const idx = match.index ?? 0;
    if (last < idx) parts.push({ punct: false, text: text.slice(last, idx) });
    if (match[0]!.length > 0) parts.push({ punct: true, text: match[0]! });
    last = idx + match[0]!.length;
  }
  if (last < text.length) parts.push({ punct: false, text: text.slice(last) });
  return parts;
}

function runEspeakIpa(text: string, lang: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "espeak-ng",
      ["-q", "-b", "1", "--ipa", "--tie=^", "-v", lang, "--", text],
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
}

/**
 * IPA for a Kokoro non-English voice via system espeak-ng.
 * phonemizer.js (bundled by kokoro-js) only ships English voice data, so
 * passing "es" throws Invalid language identifier.
 *
 * Matches hexgrad/misaki EspeakG2P: tie=^, preserve punctuation, with stress.
 */
export async function phonemizeForKokoro(text: string, lang: string): Promise<string> {
  const prepared = prepareEspeakText(normalizeEspeakNumerals(text));
  const segments = splitKeepingPunctuation(prepared);
  const parts: string[] = [];

  for (const seg of segments) {
    if (seg.punct) {
      parts.push(seg.text);
      continue;
    }
    if (!seg.text.trim()) continue;
    const ipa = await runEspeakIpa(seg.text, lang);
    if (!ipa) continue;
    parts.push(applyKokoroEspeakFixups(ipa));
  }

  const joined = parts.join("").replace(/\s+/g, " ").trim();
  if (!joined) {
    throw new Error(`espeak-ng produced no phonemes for lang=${lang}`);
  }
  return joined;
}
