/**
 * Kokoro TTS subprocess worker.
 *
 * Runs in an isolated child process to avoid the ONNX runtime conflict between
 * kokoro-js and @huggingface/transformers. Reads a JSON config from the path
 * passed as argv[2], generates audio, writes a WAV file, then exits.
 *
 * IPC protocol:
 *   Input:  JSON file at argv[2] → { text: string, voice: string, speed?: number, outputPath: string }
 *   Output: WAV file written to outputPath
 *   Exit:   0 = success, 1 = error (message on stderr)
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { phonemizeForKokoro } from "./kokoro-espeak.js";
import {
  isKokoroEnglishVoice,
  KOKORO_LANG_TO_PHONEME,
  mixVoiceEmbeddings,
  parseKokoroVoiceSpec,
} from "./kokoro-voices.js";

const VOICE_BIN_URL =
  "https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices";

const voiceBinCache = new Map<string, Float32Array>();

interface KokoroConfig {
  text: string;
  voice: string;
  speed?: number;
  outputPath: string;
}

async function loadVoiceBin(id: string): Promise<Float32Array> {
  const cached = voiceBinCache.get(id);
  if (cached) return cached;
  const res = await fetch(`${VOICE_BIN_URL}/${id}.bin`);
  if (!res.ok) throw new Error(`Failed to download Kokoro voice "${id}": ${res.status}`);
  const data = new Float32Array(await res.arrayBuffer());
  voiceBinCache.set(id, data);
  return data;
}

async function resolveVoiceData(spec: string): Promise<Float32Array | null> {
  const blend = parseKokoroVoiceSpec(spec);
  if (blend.parts.length <= 1) return null;
  const loaded = await Promise.all(
    blend.parts.map(async (p) => ({ data: await loadVoiceBin(p.id), weight: p.weight })),
  );
  return mixVoiceEmbeddings(loaded);
}

type KokoroTensor = new (type: string, data: Float32Array | number[], dims: number[]) => unknown;

let kokoroTensorCtor: KokoroTensor | undefined;

/** Same Tensor class kokoro-js uses (transformers 3 / ORT 1.21), not the app's transformers 4. */
async function loadKokoroTensor(): Promise<KokoroTensor> {
  if (kokoroTensorCtor) return kokoroTensorCtor;
  const require = createRequire(import.meta.url);
  const fromKokoro = createRequire(require.resolve("kokoro-js"));
  const transformersPath = fromKokoro.resolve("@huggingface/transformers");
  const mod = (await import(pathToFileURL(transformersPath).href)) as { Tensor: KokoroTensor };
  kokoroTensorCtor = mod.Tensor;
  return kokoroTensorCtor;
}

type KokoroRuntime = {
  generate_from_ids: (
    ids: { dims: number[] },
    opts?: { voice?: string; speed?: number },
  ) => Promise<{ toWav: () => ArrayBuffer }>;
  model: (inputs: unknown) => Promise<{ waveform: { data: Float32Array } }>;
};

async function generateWavFromIds(
  tts: KokoroRuntime,
  inputIds: { dims: number[] },
  voiceSpec: string,
  mixedData: Float32Array | null,
  speed: number,
): Promise<Uint8Array> {
  if (!mixedData) {
    const audio = await tts.generate_from_ids(inputIds, { voice: voiceSpec, speed });
    return new Uint8Array(audio.toWav());
  }

  // Tensor MUST come from kokoro-js's transformers@3 (onnxruntime 1.21).
  // Importing the app's @huggingface/transformers@4 loads onnxruntime 1.24 into
  // the same process and crashes: VERS_1.24.3 not found in libonnxruntime.so.1.
  const Tensor = await loadKokoroTensor();
  const seq = Number(inputIds.dims.at(-1) ?? 0);
  const offset = 256 * Math.min(Math.max(seq - 2, 0), 509);
  const style = mixedData.slice(offset, offset + 256);
  const { waveform } = (await tts.model({
    input_ids: inputIds,
    style: new Tensor("float32", style, [1, 256]),
    speed: new Tensor("float32", [speed], [1]),
  })) as { waveform: { data: Float32Array } };

  const pcm = Buffer.from(waveform.data.buffer, waveform.data.byteOffset, waveform.data.byteLength);
  const header = buildWavHeader(pcm.length, 24000, 1, 32, 3);
  return new Uint8Array(Buffer.concat([header, pcm]));
}

async function main() {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("Usage: kokoro-worker.ts <config.json>");
    process.exit(1);
  }

  const config: KokoroConfig = JSON.parse(readFileSync(configPath, "utf-8"));

  const { KokoroTTS, TextSplitterStream } = await import("kokoro-js");
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
    dtype: "q8",
  });

  const voice = config.voice;
  const speed = config.speed ?? 1;
  const blend = parseKokoroVoiceSpec(voice);
  const primaryId = blend.primaryId;
  const mixedData = await resolveVoiceData(voice);

  // Use stream() instead of generate() to avoid 511-token truncation.
  // generate() silently truncates at ~511 tokens via tokenizer({truncation:true}).
  // stream() splits by sentence and generates each chunk within the token limit.
  const splitter = new TextSplitterStream();
  const wavChunks: Uint8Array[] = [];

  if (isKokoroEnglishVoice(primaryId) && !mixedData) {
    const stream = tts.stream(splitter, { voice: primaryId as "af_heart", speed });
    splitter.push(config.text);
    splitter.close();
    for await (const { audio } of stream) {
      wavChunks.push(new Uint8Array(audio.toWav()));
    }
  } else {
    // kokoro-js 1.2.1 only catalogs en-US/en-GB and its phonemizer.js WASM is
    // English-only ("es" throws). Use multilingual espeak-ng, then skip the
    // frozen VOICES check via generate_from_ids (ONNX ships ef_dora.bin etc.).
    const lang = KOKORO_LANG_TO_PHONEME[primaryId.at(0) ?? "e"] ?? "es";
    splitter.push(config.text);
    splitter.close();
    for await (const sentence of splitter) {
      const clause = /[.!?…]\s*$/.test(sentence) ? sentence : `${sentence.trimEnd()}.`;
      const phonemeStr = await phonemizeForKokoro(clause, lang);
      const { input_ids } = tts.tokenizer(phonemeStr, { truncation: true });
      wavChunks.push(await generateWavFromIds(tts as unknown as KokoroRuntime, input_ids, primaryId, mixedData, speed));
    }
  }

  if (wavChunks.length === 0) {
    throw new Error("Kokoro stream produced no audio chunks");
  }

  if (wavChunks.length === 1) {
    // Single chunk — write directly
    writeFileSync(config.outputPath, Buffer.from(wavChunks[0]!));
  } else {
    // Multiple chunks — extract raw PCM from each WAV and concatenate,
    // then wrap in a single WAV header.
    const pcmChunks: Buffer[] = [];
    let sampleRate = 24000;
    let bitDepth = 16;
    let channels = 1;
    let audioFormat = 1; // 1=PCM, 3=IEEE float

    for (const wavBytes of wavChunks) {
      const buf = Buffer.from(wavBytes);
      // Parse WAV header to find data chunk
      // Standard WAV: RIFF(4) + size(4) + WAVE(4) + chunks...
      // Each chunk: id(4) + size(4) + data(size)
      let offset = 12; // skip RIFF header
      while (offset < buf.length - 8) {
        const chunkId = buf.toString("ascii", offset, offset + 4);
        const chunkSize = buf.readUInt32LE(offset + 4);

        if (chunkId === "fmt ") {
          audioFormat = buf.readUInt16LE(offset + 8);
          channels = buf.readUInt16LE(offset + 10);
          sampleRate = buf.readUInt32LE(offset + 12);
          bitDepth = buf.readUInt16LE(offset + 22);
        }

        if (chunkId === "data") {
          pcmChunks.push(buf.subarray(offset + 8, offset + 8 + chunkSize));
          break;
        }

        offset += 8 + chunkSize;
      }
    }

    // Build a single WAV from concatenated samples, preserving the source format
    // (kokoro-js outputs 32-bit IEEE float / format code 3)
    const totalPcm = Buffer.concat(pcmChunks);
    const wavHeader = buildWavHeader(totalPcm.length, sampleRate, channels, bitDepth, audioFormat);
    writeFileSync(config.outputPath, Buffer.concat([wavHeader, totalPcm]));
  }
}

function buildWavHeader(
  dataSize: number,
  sampleRate: number,
  channels: number,
  bitDepth: number,
  audioFormat: number = 1,
): Buffer {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * (bitDepth / 8);
  const blockAlign = channels * (bitDepth / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(audioFormat, 20); // 1=PCM, 3=IEEE float
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  return header;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
