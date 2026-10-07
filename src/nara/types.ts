import type { TTSProviderKey } from "../schema/providers.js";

export type NaraStatus = "queued" | "writing" | "speaking" | "encoding" | "completed" | "failed" | "cancelled";

export interface NaraJobConfig {
  idea: string;
  durationSec: number;
  language: string;
  tone: string;
  ttsProvider: TTSProviderKey;
  ttsModel?: string;
  voice?: string;
  speed?: number;
  stability?: number;
  style?: number;
  instructions?: string;
}

export interface NaraJobMeta {
  id: string;
  userId: string;
  idea: string;
  title?: string;
  status: NaraStatus;
  stage: string;
  detail: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  config: NaraJobConfig;
  scriptChars?: number;
  hasMp3?: boolean;
}

export interface NaraScriptDoc {
  title: string;
  script: string;
  language: string;
  tone: string;
  idea: string;
  targetWords: number;
}
