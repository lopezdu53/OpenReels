import type { z } from "zod";
import type { MusicMood } from "./director-score.js";

export type LLMProviderKey = "anthropic" | "openai" | "gemini" | "openrouter" | "openai-compatible" | "vivi" | "alicloud";
export type SearchProviderKey = "native" | "tavily" | "none";
export type TTSProviderKey = "elevenlabs" | "inworld" | "kokoro" | "gemini-tts" | "openai-tts";
export type ImageProviderKey = "gemini" | "openai" | "vivi" | "alicloud";
export type StockProviderKey = "pexels" | "pixabay";
export type VideoProviderKey = "gemini" | "fal" | "vivi" | "grok" | "vidu" | "vidu-q3-pro" | "vidu-q3-fast" | "vidu-q3-turbo" | "vidu-q2-pro" | "vidu-q2-fast" | "vidu-q2-turbo" | "vidu-q1" | "vidu-q1-classic" | "vidu-2.0" | "alicloud-wan-turbo" | "alicloud-wan-plus";
export type MusicProviderKey = "bundled" | "lyria";

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMResult<T> {
  data: T;
  usage: LLMUsage;
}

export interface LLMProvider {
  readonly id: LLMProviderKey;
  generate<T extends z.ZodType>(opts: {
    systemPrompt: string;
    userMessage: string;
    schema: T;
    enableWebSearch?: boolean;
  }): Promise<LLMResult<z.infer<T>>>;
}

export interface TTSProvider {
  generate(text: string): Promise<TTSResult>;
}

export interface TTSResult {
  audio: Buffer;
  words: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface ImageProvider {
  generate(prompt: string, style?: string): Promise<Buffer>;
}

export interface StockCandidate {
  url: string;
  width: number;
  height: number;
  duration?: number; // seconds, for video
  id: string; // provider-specific ID for dedup
}

export interface StockAsset {
  filePath: string;
  width: number;
  height: number;
  duration?: number; // seconds, for video
}

export interface StockProvider {
  searchVideo(query: string): Promise<StockCandidate[]>;
  searchImage(query: string): Promise<StockCandidate[]>;
  download(candidate: StockCandidate): Promise<StockAsset>;
}

export interface VideoProvider {
  readonly supportedDurations: number[];
  generate(opts: {
    sourceImage: Buffer;
    prompt: string;
    durationSeconds?: number;
    aspectRatio?: string;
    negativePrompt?: string;
  }): Promise<VideoResult>;
}

export interface VideoResult {
  filePath: string;
  durationSeconds: number;
}

export interface MusicProvider {
  generate(prompt: string, mood: MusicMood): Promise<MusicResult>;
}

export interface MusicResult {
  filePath: string;
  durationSeconds?: number;
  metadata?: Record<string, unknown>;
}
