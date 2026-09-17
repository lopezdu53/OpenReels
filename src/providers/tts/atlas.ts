import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { TTSProvider, TTSResult } from "../../schema/providers.js";
import {
  type AtlasTtsModel,
  DEFAULT_ATLAS_TTS_VOICE,
  resolveAtlasTtsModel,
} from "../atlas/catalog.js";
import { downloadUrl, generateAudio, requireAtlasApiKey } from "../atlas/client.js";

const XAI_MAX_CHARS = 15_000;
const FLASH_MAX_CHARS = 10_000;

export function atlasLanguageBoost(language?: string): string {
  const lang = (language ?? "auto").toLowerCase();
  if (lang.startsWith("es")) return "Spanish";
  if (lang.startsWith("en")) return "English";
  if (lang.startsWith("pt")) return "Portuguese";
  if (lang.startsWith("fr")) return "French";
  if (lang.startsWith("de")) return "German";
  if (lang.startsWith("it")) return "Italian";
  if (lang.startsWith("ja")) return "Japanese";
  if (lang.startsWith("ko")) return "Korean";
  if (lang.startsWith("zh") || lang.startsWith("cn")) return "Chinese";
  return "auto";
}

export function atlasTtsMaxChars(modelId: string): number {
  return modelId.startsWith("xai/") ? XAI_MAX_CHARS : FLASH_MAX_CHARS;
}

export function isRiffWav(buf: Buffer): boolean {
  return (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE"
  );
}

/** MiniMax defaults to mp3; ffmpeg mix needs a real wav. */
export function transcodeAtlasAudioToWav(audio: Buffer): Buffer {
  if (isRiffWav(audio) && audio.byteLength >= 1000) return audio;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-tts-"));
  const src = path.join(dir, "in.bin");
  const dest = path.join(dir, "out.wav");
  fs.writeFileSync(src, audio);
  try {
    execFileSync(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", "-i", src, "-ac", "2", "-ar", "48000", dest],
      { stdio: "pipe" },
    );
    const out = fs.readFileSync(dest);
    if (out.byteLength < 1000 || !isRiffWav(out)) {
      throw new Error("Atlas TTS transcode produced empty wav");
    }
    return out;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function atlasTtsRequestBody(opts: {
  spec: AtlasTtsModel;
  text: string;
  voice: string;
  speed: number;
  language?: string;
}): Record<string, unknown> {
  if (opts.spec.id.startsWith("xai/")) {
    return {
      text: opts.text,
      voice_id: opts.voice,
      language: "auto",
      codec: "wav",
      sample_rate: 16000,
      text_normalization: true,
      ...(opts.speed !== 1 ? { speed: opts.speed } : {}),
    };
  }
  if (opts.spec.id.startsWith("minimax/")) {
    return {
      text: opts.text,
      voice: opts.voice,
      format: "wav",
      sample_rate: 32000,
      language_boost: atlasLanguageBoost(opts.language),
      ...(opts.speed !== 1 ? { speed: opts.speed } : {}),
    };
  }
  return {
    text: opts.text,
    voice: opts.voice,
    voice_name: opts.voice,
  };
}

export class AtlasTTS implements TTSProvider {
  private apiKey: string;
  private voice: string;
  private speed: number;
  private modelId: string;
  private language: string;
  private spec: AtlasTtsModel;

  constructor(
    voice: string = DEFAULT_ATLAS_TTS_VOICE,
    apiKey?: string,
    speed?: number,
    model?: string,
    language?: string,
  ) {
    this.apiKey = requireAtlasApiKey("TTS", apiKey);
    this.spec = resolveAtlasTtsModel(model);
    this.modelId = this.spec.id;
    this.voice = voice || this.spec.voices[0]?.id || DEFAULT_ATLAS_TTS_VOICE;
    this.speed = speed != null ? Math.min(1.5, Math.max(0.7, speed)) : 1.0;
    this.language = language || "auto";
  }

  async generate(text: string): Promise<TTSResult> {
    const max = atlasTtsMaxChars(this.modelId);
    if (text.length > max) {
      throw new Error(
        `Atlas TTS limit exceeded: script is ${text.length} chars, max ${max} for ${this.modelId}. Shorten the script.`,
      );
    }

    const extra = atlasTtsRequestBody({
      spec: this.spec,
      text,
      voice: this.voice,
      speed: this.speed,
      language: this.language,
    });
    const url = await generateAudio(this.apiKey, this.modelId, extra);
    const audio = transcodeAtlasAudioToWav(await downloadUrl(url));
    if (audio.byteLength === 0) throw new Error("Atlas TTS returned empty audio");
    return { audio, words: [] };
  }
}
