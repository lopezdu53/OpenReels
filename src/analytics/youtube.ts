/** YouTube RPM/CPM heuristics (USD per 1k views). Shorts RPM is much lower. */
export const NICHE_CPM_USD: Record<string, { longform: number; shorts: number }> = {
  finance: { longform: 12, shorts: 0.08 },
  insurance: { longform: 15, shorts: 0.06 },
  tech: { longform: 8, shorts: 0.06 },
  education: { longform: 6, shorts: 0.05 },
  history: { longform: 5, shorts: 0.04 },
  science: { longform: 5, shorts: 0.04 },
  culture: { longform: 4, shorts: 0.04 },
  entertainment: { longform: 3, shorts: 0.03 },
  gaming: { longform: 4, shorts: 0.03 },
  beauty: { longform: 7, shorts: 0.05 },
  food: { longform: 5, shorts: 0.04 },
  default: { longform: 5, shorts: 0.04 },
};

const NICHE_ALIASES: Record<string, string> = {
  finanzas: "finance",
  finance: "finance",
  dinero: "finance",
  inversion: "finance",
  inversión: "finance",
  seguros: "insurance",
  insurance: "insurance",
  seguro: "insurance",
  tecnología: "tech",
  tecnologia: "tech",
  tech: "tech",
  educación: "education",
  educacion: "education",
  education: "education",
  historia: "history",
  history: "history",
  ciencia: "science",
  science: "science",
  cultura: "culture",
  culture: "culture",
  entretenimiento: "entertainment",
  entertainment: "entertainment",
  videojuegos: "gaming",
  gaming: "gaming",
  juegos: "gaming",
  belleza: "beauty",
  beauty: "beauty",
  recetas: "food",
  comida: "food",
  cocina: "food",
  food: "food",
};

export function guessNicheKey(query: string): string {
  const q = query.toLowerCase();
  const aliases = Object.keys(NICHE_ALIASES).sort((a, b) => b.length - a.length);
  const hit = aliases.find((alias) => q.includes(alias));
  return (hit ? NICHE_ALIASES[hit] : undefined) ?? "default";
}

export function cpmFor(query: string, shorts: boolean): number {
  const fallback = NICHE_CPM_USD.default ?? { longform: 5, shorts: 0.04 };
  const row = NICHE_CPM_USD[guessNicheKey(query)] ?? fallback;
  return shorts ? row.shorts : row.longform;
}

/** YouTube pays the creator ~55% of ad revenue. */
export function estimateAdRevenueUsd(views: number, cpmUsd: number): number {
  if (views <= 0 || cpmUsd <= 0) return 0;
  return (views / 1000) * cpmUsd * 0.55;
}

export function parseIsoDurationSeconds(iso: string | undefined): number {
  if (!iso) return 0;
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

export function isShortsDuration(seconds: number): boolean {
  return seconds > 0 && seconds <= 180;
}

export function youtubeApiKey(): string | undefined {
  return process.env["YOUTUBE_API_KEY"] || process.env["GOOGLE_API_KEY"] || undefined;
}

const YT = "https://www.googleapis.com/youtube/v3";

async function ytGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const key = youtubeApiKey();
  if (!key)
    throw new Error("YOUTUBE_API_KEY (or GOOGLE_API_KEY with YouTube Data API) is required");
  const url = new URL(`${YT}/${path}`);
  url.searchParams.set("key", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(json.error?.message ?? `YouTube API ${res.status}`);
  }
  return json;
}

interface YtSearchItem {
  id?: { channelId?: string; videoId?: string; kind?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
  };
}

interface YtListResponse {
  items?: YtSearchItem[];
}

interface YtChannelItem {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
    country?: string;
  };
  statistics?: {
    viewCount?: string;
    subscriberCount?: string;
    videoCount?: string;
    hiddenSubscriberCount?: boolean;
  };
}

interface YtVideoItem {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    channelId?: string;
    publishedAt?: string;
    tags?: string[];
    thumbnails?: { medium?: { url?: string }; high?: { url?: string } };
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: { duration?: string };
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

function num(s: string | undefined): number {
  const n = Number(s ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function searchChannels(query: string, max = 8): Promise<AnalyticsChannel[]> {
  const search = await ytGet<YtListResponse>("search", {
    part: "snippet",
    type: "channel",
    q: query,
    maxResults: String(max),
    relevanceLanguage: "es",
  });
  const ids = (search.items ?? [])
    .map((i) => i.id?.channelId ?? i.snippet?.channelId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  return hydrateChannels(ids, query);
}

export async function hydrateChannels(
  ids: string[],
  nicheQuery: string,
): Promise<AnalyticsChannel[]> {
  const data = await ytGet<{ items?: YtChannelItem[] }>("channels", {
    part: "snippet,statistics",
    id: ids.slice(0, 20).join(","),
  });
  const cpm = cpmFor(nicheQuery, false);
  return (data.items ?? []).map((ch) => {
    const views = num(ch.statistics?.viewCount);
    const id = ch.id ?? "";
    return {
      id,
      title: ch.snippet?.title ?? "",
      handle: ch.snippet?.customUrl,
      description: (ch.snippet?.description ?? "").slice(0, 400),
      thumbnail: ch.snippet?.thumbnails?.medium?.url ?? ch.snippet?.thumbnails?.high?.url,
      country: ch.snippet?.country,
      subscribers: ch.statistics?.hiddenSubscriberCount ? 0 : num(ch.statistics?.subscriberCount),
      views,
      videoCount: num(ch.statistics?.videoCount),
      estimatedRevenueUsd: estimateAdRevenueUsd(views, cpm),
      cpmUsd: cpm,
      url: `https://www.youtube.com/channel/${id}`,
    };
  });
}

export async function searchVideos(query: string, max = 10): Promise<AnalyticsVideo[]> {
  const search = await ytGet<YtListResponse>("search", {
    part: "snippet",
    type: "video",
    q: query,
    maxResults: String(max),
    order: "viewCount",
    relevanceLanguage: "es",
  });
  const ids = (search.items ?? [])
    .map((i) => i.id?.videoId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  return hydrateVideos(ids, query);
}

export async function channelVideos(
  channelId: string,
  nicheQuery: string,
  max = 8,
): Promise<AnalyticsVideo[]> {
  const search = await ytGet<YtListResponse>("search", {
    part: "snippet",
    type: "video",
    channelId,
    maxResults: String(max),
    order: "viewCount",
  });
  const ids = (search.items ?? [])
    .map((i) => i.id?.videoId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return [];
  return hydrateVideos(ids, nicheQuery);
}

export async function hydrateVideos(ids: string[], nicheQuery: string): Promise<AnalyticsVideo[]> {
  const data = await ytGet<{ items?: YtVideoItem[] }>("videos", {
    part: "snippet,statistics,contentDetails",
    id: ids.slice(0, 20).join(","),
  });
  return (data.items ?? []).map((v) => {
    const durationSeconds = parseIsoDurationSeconds(v.contentDetails?.duration);
    const shorts = isShortsDuration(durationSeconds);
    const views = num(v.statistics?.viewCount);
    const cpm = cpmFor(nicheQuery, shorts);
    const id = v.id ?? "";
    return {
      id,
      title: v.snippet?.title ?? "",
      description: (v.snippet?.description ?? "").slice(0, 280),
      channelId: v.snippet?.channelId,
      channelTitle: v.snippet?.channelTitle,
      publishedAt: v.snippet?.publishedAt,
      thumbnail: v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.high?.url,
      views,
      likes: num(v.statistics?.likeCount),
      comments: num(v.statistics?.commentCount),
      durationSeconds,
      shorts,
      estimatedRevenueUsd: estimateAdRevenueUsd(views, cpm),
      tags: (v.snippet?.tags ?? []).slice(0, 8),
      url: `https://www.youtube.com/watch?v=${id}`,
    };
  });
}

export interface TavilyHit {
  title: string;
  url: string;
  content: string;
}

export async function tavilySearch(query: string, max = 8): Promise<TavilyHit[]> {
  const key = process.env["TAVILY_API_KEY"];
  if (!key) return [];
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: max,
      search_depth: "basic",
      include_answer: false,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}`);
  const json = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  return (json.results ?? []).map((r) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    content: (r.content ?? "").slice(0, 500),
  }));
}
