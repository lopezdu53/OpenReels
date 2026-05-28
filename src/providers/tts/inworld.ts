import type { TTSProvider, TTSResult, WordTimestamp } from "../../schema/providers.js";

const INWORLD_BASE = "https://api.inworld.ai/tts/v1";
const MAX_INPUT_CHARS = 2000;

export class InworldTTS implements TTSProvider {
  private apiKey: string;
  private voiceId: string;
  private modelId: string;

  constructor(
    voiceId: string = "Dennis",
    modelId: string = "inworld-tts-1.5-max",
    apiKey?: string,
  ) {
    const key = apiKey ?? process.env["INWORLD_TTS_API_KEY"];
    if (!key) throw new Error("INWORLD_TTS_API_KEY environment variable is required");
    this.apiKey = key;
    this.voiceId = voiceId;
    this.modelId = modelId;
  }

  async generate(text: string): Promise<TTSResult> {
    if (text.length <= MAX_INPUT_CHARS) {
      return this.generateChunk(text);
    }

    // Split into sentence-boundary chunks and stitch results together
    const chunks = splitIntoChunks(text, MAX_INPUT_CHARS);
    console.log(`[inworld] Script ${text.length} chars — splitting into ${chunks.length} chunks`);

    const audioBuffers: Buffer[] = [];
    const allWords: WordTimestamp[] = [];
    let timeOffset = 0;

    for (const chunk of chunks) {
      const result = await this.generateChunk(chunk);
      audioBuffers.push(result.audio);

      for (const w of result.words) {
        allWords.push({ word: w.word, start: w.start + timeOffset, end: w.end + timeOffset });
      }

      // Advance offset by the end time of the last word in this chunk
      const lastWord = result.words[result.words.length - 1];
      if (lastWord) timeOffset = lastWord.end + timeOffset;
    }

    return { audio: Buffer.concat(audioBuffers), words: allWords };
  }

  private async generateChunk(text: string): Promise<TTSResult> {
    const response = await fetch(`${INWORLD_BASE}/voice`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        voiceId: this.voiceId,
        modelId: this.modelId,
        audioConfig: {
          audioEncoding: "MP3",
        },
        timestampType: "WORD",
        applyTextNormalization: "ON",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Inworld TTS API error (${response.status}): ${errorText}`);
    }

    const responseText = await response.text();
    let data: InworldTTSResponse;
    try {
      data = JSON.parse(responseText) as InworldTTSResponse;
    } catch {
      throw new Error(`Inworld TTS returned invalid JSON: ${responseText.slice(0, 200)}`);
    }

    if (!data.audioContent) {
      throw new Error("Inworld TTS response missing audioContent");
    }
    if (!data.timestampInfo?.wordAlignment) {
      throw new Error("Inworld TTS response missing timestamp info");
    }

    const { words, wordStartTimeSeconds, wordEndTimeSeconds } = data.timestampInfo.wordAlignment;

    if (
      words.length !== wordStartTimeSeconds.length ||
      words.length !== wordEndTimeSeconds.length
    ) {
      throw new Error(
        `Inworld TTS timestamp array length mismatch: words=${words.length}, starts=${wordStartTimeSeconds.length}, ends=${wordEndTimeSeconds.length}`,
      );
    }

    const timestamps: WordTimestamp[] = words.map((word, i) => ({
      word,
      start: wordStartTimeSeconds[i] ?? 0,
      end: wordEndTimeSeconds[i] ?? 0,
    }));

    return { audio: Buffer.from(data.audioContent, "base64"), words: timestamps };
  }
}

/**
 * Splits text into chunks of at most maxChars, breaking at sentence boundaries
 * (. ! ?) when possible, otherwise at the last space before the limit.
 */
function splitIntoChunks(text: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    // Try to break at the last sentence boundary before the limit
    const window = remaining.slice(0, maxChars);
    const sentenceEnd = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
    );

    const breakAt = sentenceEnd > maxChars * 0.4
      ? sentenceEnd + 1  // include the punctuation, split after the space
      : window.lastIndexOf(" "); // fallback: last word boundary

    const cut = breakAt > 0 ? breakAt : maxChars;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
}

interface InworldTTSResponse {
  audioContent: string;
  usage?: {
    processedCharactersCount: number;
    modelId: string;
  };
  timestampInfo?: {
    wordAlignment: {
      words: string[];
      wordStartTimeSeconds: number[];
      wordEndTimeSeconds: number[];
      phoneticDetails?: unknown[];
    };
  };
}
