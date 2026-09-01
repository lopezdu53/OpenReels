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
  atelierMode?: boolean;
  artStyleOverride?: string;
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
  language?: string;
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
  kokoroVoices?: VoiceOption[];
  runpodImageModels?: { id: string; label: string; kind: string; costHint: string; defaultSteps?: number; maxSteps?: number; defaultGuidance?: number }[];
  runpodVideoModels?: { id: string; label: string; kind: string; costHint: string; durations: number[]; resolutions: string[] }[];
  atelierStyles?: { id: string; label: string; artStyle: string }[];
}

export interface StatsResponse {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  activeJobs: number;
  totalCost: number;
}

export interface AnalyticsChannel {
  id: string;
  title: string;
  handle?: string;
  description: string;
  thumbnail?: string;
  country?: string;
  subscribers: number;
  views: number;
  videoCount: number;
  estimatedRevenueUsd: number;
  cpmUsd: number;
  url: string;
}

export interface AnalyticsVideo {
  id: string;
  title: string;
  description: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnail?: string;
  views: number;
  likes: number;
  comments: number;
  durationSeconds: number;
  shorts: boolean;
  estimatedRevenueUsd: number;
  tags: string[];
  url: string;
}

export interface AnalyticsWebHit {
  title: string;
  url: string;
  content: string;
}

export interface NicheResearch {
  query: string;
  source: "youtube" | "tavily" | "mixed";
  cpmLongformUsd: number;
  cpmShortsUsd: number;
  channels: AnalyticsChannel[];
  videos: AnalyticsVideo[];
  webHits: AnalyticsWebHit[];
  ideas: string[];
  warning?: string;
}

export interface PlatformPack {
  title: string;
  description: string;
  hashtags: string[];
}

export interface ChannelStrategy {
  channelName: string;
  tagline: string;
  positioning: string;
  targetAudience: string;
  voiceTone: string;
  contentPillars: { name: string; description: string; exampleTopics: string[] }[];
  differentiation: string[];
  monetization: { youtube: string; tiktok: string; facebook: string; bilibili: string };
  firstMonthFocus: string;
  postingCadence: string;
}

export interface CalendarItem {
  slot: number;
  topic: string;
  pillar: string;
  format: "short" | "long";
  youtube: PlatformPack;
  tiktok: PlatformPack;
  bilibili: PlatformPack;
  facebook: PlatformPack;
}

export interface ContentCalendar {
  channelName: string;
  videosPerDay: number;
  days: { date: string; weekday: string; items: CalendarItem[] }[];
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
  atelierMode?: boolean;
  artStyleOverride?: string;
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
    kokoroVoice?: string;
    kokoroSpeed?: number;
    runpodImageModel?: string;
    runpodVideoModel?: string;
    runpodImageSteps?: number;
    runpodImageGuidance?: number;
    runpodVideoResolution?: string;
    runpodImageEndpointId?: string;
    runpodVideoEndpointId?: string;
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

  testImage(data: { provider?: string; prompt: string; style?: string; aspectRatio?: string; model?: string; steps?: number; guidance?: number }) {
    return fetchJson<{ imageBase64: string; durationMs: number }>(
      "/test/image", { method: "POST", body: JSON.stringify(data) }
    );
  },

  testVideo(data: { provider?: string; imageBase64: string; prompt: string; durationSeconds?: number; aspectRatio?: string; model?: string; resolution?: string }) {
    return fetchJson<{ videoBase64: string; durationMs: number; videoSeconds: number }>(
      "/test/video", { method: "POST", body: JSON.stringify(data) }
    );
  },

  analyticsStatus() {
    return fetchJson<{ youtube: boolean; tavily: boolean; vivi: boolean }>("/analytics/status");
  },

  analyticsResearch(query: string) {
    return fetchJson<NicheResearch>("/analytics/research", {
      method: "POST",
      body: JSON.stringify({ query }),
    });
  },

  analyticsChannelVideos(channelId: string, niche: string) {
    return fetchJson<{ videos: AnalyticsVideo[] }>("/analytics/channel-videos", {
      method: "POST",
      body: JSON.stringify({ channelId, niche }),
    });
  },

  analyticsStrategy(research: NicheResearch, angle?: string) {
    return fetchJson<{ strategy: ChannelStrategy }>("/analytics/strategy", {
      method: "POST",
      body: JSON.stringify({ research, angle }),
    });
  },

  analyticsCalendar(data: {
    research: NicheResearch;
    strategy: ChannelStrategy;
    videosPerDay: number;
    days?: number;
    startDate?: string;
  }) {
    return fetchJson<{ calendar: ContentCalendar }>("/analytics/calendar", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};
