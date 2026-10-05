import wavefile from "wavefile";
import type { WordTimestamp } from "../../schema/providers.js";

type TranscriberPipeline = (
  audio: Float32Array,
  opts: {
    return_timestamps: "word";
    chunk_length_s: number;
    stride_length_s: number;
    language?: string;
  },
) => Promise<{ chunks: { text: string; timestamp: [number, number] }[] }>;

/**
 * Extracts word-level timestamps from audio using Whisper forced alignment.
 *
 * Lazy-loads the Whisper model on first call and caches the pipeline instance.
 * Uses whisper-small_timestamped (multilingual + cross-attentions).
 * Plain `whisper-small` ONNX is not exported with output_attentions, so
 * `return_timestamps: "word"` throws and kills Kokoro/Gemini TTS jobs.
 *
 *   audio (WAV/PCM) ──► resample 16kHz ──► Whisper ASR ──► raw words
 *                                                              │
 *   known transcript ─────────────────────────────────► alignToTranscript()
 *                                                              │
 *                                                        WordTimestamp[]
 */
export class WhisperAligner {
  /** Multilingual small model exported with cross-attentions for word timestamps. */
  static readonly MODEL_ID = "onnx-community/whisper-small_timestamped";
  private transcriber: TranscriberPipeline | null = null;
  private loadingPromise: Promise<TranscriberPipeline> | null = null;

  private async getTranscriber(): Promise<TranscriberPipeline> {
    if (this.transcriber) return this.transcriber;
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = (async () => {
      try {
        const { pipeline } = await import("@huggingface/transformers");
        const transcriber = await pipeline(
          "automatic-speech-recognition",
          WhisperAligner.MODEL_ID,
        );
        this.transcriber = transcriber as unknown as TranscriberPipeline;
        return this.transcriber;
      } catch (err) {
        this.loadingPromise = null;
        throw new Error(
          `Failed to load Whisper model (${WhisperAligner.MODEL_ID}): ${err instanceof Error ? err.message : String(err)}. ` +
            "Check your network connection. The model (~460MB) downloads from HuggingFace on first run.",
        );
      }
    })();

    return this.loadingPromise;
  }

  /**
   * Align audio to known transcript text, producing word-level timestamps.
   * Throws if Whisper produces 0 usable words (hard fail — broken captions are
   * worse than no video).
   */
  async align(audio: Buffer, text: string): Promise<WordTimestamp[]> {
    const float32 = this.audioToFloat32(audio);
    // Derive actual audio duration from the resampled float32 (always 16kHz after conversion).
    const audioDurationSeconds = float32.length / 16000;
    const transcriber = await this.getTranscriber();
    const language = detectWhisperLanguage(text);

    let result: { chunks: { text: string; timestamp: [number, number] }[] };
    try {
      result = await transcriber(float32, {
        return_timestamps: "word",
        chunk_length_s: 30,
        stride_length_s: 5,
        ...(language ? { language } : {}),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("cross attentions") || msg.includes("output_attentions")) {
        console.warn(
          `[whisper-aligner] ${msg} Falling back to duration-based caption timestamps.`,
        );
        return estimateTimestampsFromDuration(text, audioDurationSeconds);
      }
      throw err;
    }

    const whisperWords: WordTimestamp[] = (result.chunks ?? []).map((c) => ({
      word: c.text.trim(),
      start: c.timestamp[0],
      end: c.timestamp[1],
    }));

    // Hard fail if Whisper couldn't transcribe anything — interpolated timestamps
    // without any anchor points would produce broken captions.
    if (whisperWords.length === 0 && text.trim().length > 0) {
      throw new Error(
        `Whisper alignment failed: produced 0 words for ${text.split(/\s+/).length}-word transcript. ` +
          "The audio may be corrupt, silent, or in an unsupported format.",
      );
    }

    const words = this.alignToTranscript(text, whisperWords);

    // Whisper has a 30-second context window. When audio is longer, transformers.js may
    // not correctly offset word timestamps across chunks, causing all words to appear
    // compressed into the first ~29s. Detect this by comparing the last word's end time
    // to the real audio duration and scale proportionally if needed.
    const lastWordEnd = words[words.length - 1]?.end ?? 0;
    if (lastWordEnd > 0 && audioDurationSeconds > lastWordEnd * 1.15) {
      const scale = audioDurationSeconds / lastWordEnd;
      console.warn(
        `[whisper-aligner] Timestamps compressed (last word at ${lastWordEnd.toFixed(1)}s, audio is ${audioDurationSeconds.toFixed(1)}s). Scaling by ${scale.toFixed(2)}x.`,
      );
      return words.map((w) => ({
        word: w.word,
        start: w.start * scale,
        end: w.end * scale,
      }));
    }

    return words;
  }

  /**
   * Map Whisper's recognized words to the known transcript using greedy
   * window matching with substring fallback and neighbor interpolation
   * for missed words.
   */
  alignToTranscript(text: string, hyp: WordTimestamp[]): WordTimestamp[] {
    const norm = (w: string) =>
      w
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}']/gu, "");
    const refWords = text.split(/\s+/).filter((w) => norm(w).length > 0);
    const result: WordTimestamp[] = [];
    let hi = 0;

    for (const rw of refWords) {
      const nr = norm(rw);
      if (!nr) continue;

      // Greedy search: look ahead up to 5 positions for a match
      let best = -1;
      for (let j = hi; j < Math.min(hi + 5, hyp.length); j++) {
        const nh = norm(hyp[j]!.word);
        if (nr === nh) {
          best = j;
          break;
        }
        if (nr.includes(nh) || nh.includes(nr)) {
          if (best === -1) best = j;
        }
      }

      if (best >= 0) {
        result.push({ word: rw, start: hyp[best]!.start, end: hyp[best]!.end });
        hi = best + 1;
      } else {
        // Interpolate from last known position using character-based duration estimate.
        // ~60ms per character at normal speech pace, with a floor of 100ms.
        const prev = result[result.length - 1];
        const start = prev?.end ?? 0;
        const estimatedDuration = Math.max(0.1, rw.length * 0.06);
        result.push({ word: rw, start, end: start + estimatedDuration });
      }
    }

    return result;
  }

  /**
   * Convert WAV/PCM buffer to 16kHz float32 samples for Whisper.
   * Uses wavefile for format detection and resampling.
   */
  private audioToFloat32(audio: Buffer): Float32Array {
    const wav = new wavefile.WaveFile(audio);

    wav.toBitDepth("32f");
    wav.toSampleRate(16000);

    let samples = wav.getSamples() as Float64Array | Float64Array[];
    if (Array.isArray(samples)) samples = samples[0]!;

    return new Float32Array(samples);
  }
}

function detectWhisperLanguage(text: string): string | undefined {
  if (/[áéíóúñü¿¡]/i.test(text)) return "spanish";
  return undefined;
}

function estimateTimestampsFromDuration(text: string, durationSeconds: number): WordTimestamp[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [];
  const totalChars = words.reduce((sum, w) => sum + Math.max(1, w.length), 0);
  const span = Math.max(durationSeconds, words.length * 0.12);
  let t = 0;
  return words.map((word) => {
    const dur = span * (Math.max(1, word.length) / totalChars);
    const start = t;
    t += dur;
    return { word, start, end: t };
  });
}
