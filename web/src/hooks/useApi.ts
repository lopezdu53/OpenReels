const API_BASE = "/api/v1";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((error as { error?: string }).error ?? `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export interface JobConfig {
  llm?: string;
  tts?: string;
  image?: string;
  video?: string;
  music?: string;
  platform?: string;
  pacing?: string;
  videoSceneMode?: string;
  noVideo?: boolean;
  noSubtitles?: boolean;
  styleReference?: boolean;
}

export interface JobSummary {
  id: string;
  topic: string;
  archetype?: string;
  status: string;
  createdAt?: string;
  completedAt?: string;
  videoPath?: string;
  stages?: Record<string, { status: string; detail?: string; durationSec?: number }>;
  costEstimate?: CostBreakdown;
  actualCost?: ActualCostBreakdown;
  error?: string;
  runDir?: string;
  researchData?: ResearchData;
  score?: DirectorScore;
  criticReview?: CriticReview;
  tiktokCaption?: { title: string; hashtags: string[]; caption: string };
  platform?: string;
  config?: JobConfig;
}

export interface Archetype {
  name: string;
  label?: string;
  captionStyle: string;
  artStyle: string;
  mood: string;
  colorPalette?: { background: string; accent: string; text: string };
  visualColorPalette?: string[];
  scenePacing?: "fast" | "moderate" | "cinematic";
  motionIntensity?: number;
}

export interface Platform {
  name: string;
  width: number;
  height: number;
  fps: number;
  maxDurationSeconds: number;
  minDurationSeconds?: number;
  orientation?: "portrait" | "landscape";
  longForm?: boolean;
}

export interface ProviderOption {
  key: string;
  label: string;
}

export interface InworldVoice {
  id: string;
  label: string;
  lang: string;
}

export interface VoiceOption {
  id: string;
  label: string;
  gender?: string;
}

export interface ProviderOptions {
  llm: ProviderOption[];
  tts: ProviderOption[];
  image: ProviderOption[];
  video: ProviderOption[];
  search?: ProviderOption[];
  inworldVoices?: InworldVoice[];
  geminiTtsVoices?: VoiceOption[];
  grokTtsVoices?: VoiceOption[];
  grokTtsModels?: { id: string; label: string }[];
}

export interface StatsResponse {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  totalCost: number;
}

export interface CostBreakdown {
  llmCost: number;
  ttsCost: number;
  imageCost: number;
  videoCost: number;
  musicCost: number;
  totalCost: number;
  details: {
    llmCalls: number;
    ttsCharacters: number;
    aiImages: number;
    aiVideos: number;
  };
}

export interface ActualCostBreakdown {
  llmCost: number;
  ttsCost: number;
  imageCost: number;
  videoCost: number;
  musicCost: number;
  totalCost: number;
  details: {
    totalInputTokens: number;
    totalOutputTokens: number;
    ttsCharacters: number;
    aiImages: number;
    aiVideos: number;
  };
}

export interface DirectorScoreScene {
  visual_type: "ai_image" | "ai_video" | "stock_image" | "stock_video" | "text_card";
  visual_prompt: string;
  motion: "zoom_in" | "zoom_out" | "pan_right" | "pan_left" | "static";
  script_line: string;
  transition?: "none" | "crossfade" | "slide_left" | "slide_right" | "wipe" | "flip";
}

export interface DirectorScore {
  emotional_arc: string;
  archetype: string;
  music_mood: string;
  scenes: DirectorScoreScene[];
}

export interface ResearchData {
  summary: string;
  key_facts: string[];
  mood: string;
}

export interface CriticReview {
  score: number;
  strengths: string[];
  weaknesses: string[];
}

export interface CreateJobRequest {
  topic: string;
  archetype?: string;
  pacing?: string;
  platform?: string;
  dryRun?: boolean;
  noSubtitles?: boolean;
  direction?: string;
  targetDurationMinutes?: number;
  score?: Record<string, unknown>;
  allowedVisualTypes?: string[];
  videoSceneMode?: string;
  styleReferenceImage?: string; // base64
  providers?: {
    llm?: string;
    tts?: string;
    image?: string;
    music?: string;
    video?: string;
    videoModel?: string;
    llmModel?: string;
    llmBaseUrl?: string;
    searchProvider?: string;
    inworldVoice?: string;
    geminiTtsVoice?: string;
    grokTtsVoice?: string;
    grokTtsSpeed?: number;
    grokTtsModel?: string;
  };
}

export const api = {
  createJob(data: CreateJobRequest) {
    return fetchJson<{ id: string }>("/jobs", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  listJobs(limit = 20, offset = 0) {
    return fetchJson<{ jobs: JobSummary[]; total: number }>(
      `/jobs?limit=${limit}&offset=${offset}`,
    );
  },

  getJob(id: string) {
    return fetchJson<JobSummary>(`/jobs/${id}`);
  },

  cancelJob(id: string) {
    return fetchJson<{ status: string }>(`/jobs/${id}/cancel`, { method: "POST" });
  },

  deleteJob(id: string) {
    return fetchJson<{ status: string }>(`/jobs/${id}`, { method: "DELETE" });
  },

  listArchetypes() {
    return fetchJson<Archetype[]>("/archetypes");
  },

  listPlatforms() {
    return fetchJson<Platform[]>("/platforms");
  },

  listProviders() {
    return fetchJson<ProviderOptions>("/providers");
  },

  getArtifact(jobId: string, artifactPath: string) {
    return fetchJson<unknown>(`/jobs/${jobId}/artifacts/${artifactPath}`);
  },

  getHealth() {
    return fetchJson<{ status: string; redis: string; keys?: Record<string, boolean> }>("/health");
  },

  getStats() {
    return fetchJson<StatsResponse>("/stats");
  },

  testLLM(data: { provider?: string; model?: string; prompt: string }) {
    return fetchJson<{ text: string; durationMs: number; tokens: { inputTokens: number; outputTokens: number } }>(
      "/test/llm", { method: "POST", body: JSON.stringify(data) }
    );
  },

  testTTS(data: { provider?: string; text: string; voice?: string; speed?: number; model?: string }) {
    return fetchJson<{ audioBase64: string; durationMs: number; charCount: number }>(
      "/test/tts", { method: "POST", body: JSON.stringify(data) }
    );
  },

  testImage(data: { provider?: string; prompt: string; style?: string; aspectRatio?: string }) {
    return fetchJson<{ imageBase64: string; durationMs: number }>(
      "/test/image", { method: "POST", body: JSON.stringify(data) }
    );
  },

  testVideo(data: { provider?: string; imageBase64: string; prompt: string; durationSeconds?: number; aspectRatio?: string }) {
    return fetchJson<{ videoBase64: string; durationMs: number; videoSeconds: number }>(
      "/test/video", { method: "POST", body: JSON.stringify(data) }
    );
  },
};
