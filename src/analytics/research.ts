import { ViviLLM } from "../providers/llm/vivi.js";
import {
  type ChannelStrategy,
  type ContentCalendar,
  calendarSchema,
  strategySchema,
} from "./schemas.js";
import {
  type AnalyticsChannel,
  type AnalyticsVideo,
  channelVideos,
  cpmFor,
  searchChannels,
  searchVideos,
  type TavilyHit,
  tavilySearch,
  youtubeApiKey,
} from "./youtube.js";

export interface NicheResearch {
  query: string;
  source: "youtube" | "tavily" | "mixed";
  cpmLongformUsd: number;
  cpmShortsUsd: number;
  channels: AnalyticsChannel[];
  videos: AnalyticsVideo[];
  webHits: TavilyHit[];
  ideas: string[];
  warning?: string;
}

export async function researchNiche(query: string): Promise<NicheResearch> {
  const q = query.trim();
  if (q.length < 2) throw new Error("Escribe un nicho o tema (mín. 2 caracteres)");
  const cpmLongformUsd = cpmFor(q, false);
  const cpmShortsUsd = cpmFor(q, true);

  let channels: AnalyticsChannel[] = [];
  let videos: AnalyticsVideo[] = [];
  let warning: string | undefined;
  let source: NicheResearch["source"] = "tavily";

  if (youtubeApiKey()) {
    try {
      const [ch, vid] = await Promise.all([searchChannels(q, 8), searchVideos(q, 10)]);
      channels = ch.sort((a, b) => b.subscribers - a.subscribers);
      videos = vid.sort((a, b) => b.views - a.views);
      source = "youtube";
    } catch (err) {
      warning = `YouTube Data API: ${err instanceof Error ? err.message : String(err)}. Usa Tavily/Vivi como respaldo.`;
    }
  } else {
    warning =
      "Sin YOUTUBE_API_KEY: añade una clave de YouTube Data API v3 en Settings para stats reales de vistas y suscriptores.";
  }

  let webHits: TavilyHit[] = [];
  try {
    webHits = await tavilySearch(
      `mejores canales de YouTube sobre ${q} 2026 suscriptores views nicho`,
      8,
    );
  } catch (err) {
    warning = [warning, `Tavily: ${err instanceof Error ? err.message : String(err)}`]
      .filter(Boolean)
      .join(" ");
  }

  if (channels.length > 0 && webHits.length > 0) source = "mixed";
  else if (channels.length > 0) source = "youtube";

  const ideas = [
    ...videos.slice(0, 8).map((v) => v.title),
    ...webHits.slice(0, 4).map((h) => h.title),
  ].filter(Boolean);

  return {
    query: q,
    source,
    cpmLongformUsd,
    cpmShortsUsd,
    channels,
    videos,
    webHits,
    ideas,
    warning,
  };
}

export async function expandChannel(channelId: string, niche: string): Promise<AnalyticsVideo[]> {
  return channelVideos(channelId, niche, 10);
}

function packResearchForLlm(research: NicheResearch): string {
  const ch = research.channels
    .slice(0, 8)
    .map(
      (c) =>
        `- ${c.title} (${c.subscribers.toLocaleString()} subs, ${c.views.toLocaleString()} views, ~$${c.estimatedRevenueUsd.toFixed(0)} ads lifetime): ${c.description.slice(0, 160)}`,
    )
    .join("\n");
  const vids = research.videos
    .slice(0, 10)
    .map(
      (v) =>
        `- ${v.title} [${v.shorts ? "Short" : "long"}] ${v.views.toLocaleString()} views ~$${v.estimatedRevenueUsd.toFixed(0)} — ${v.channelTitle}`,
    )
    .join("\n");
  const web = research.webHits.map((h) => `- ${h.title}: ${h.content.slice(0, 180)}`).join("\n");
  return [
    `Nicho: ${research.query}`,
    `CPM estimado long-form $${research.cpmLongformUsd} / Shorts $${research.cpmShortsUsd} (USD / 1k views, creator share 55%).`,
    "",
    "Canales:",
    ch || "(sin canales de YouTube API)",
    "",
    "Videos top:",
    vids || "(sin videos)",
    "",
    "Web:",
    web || "(sin Tavily)",
  ].join("\n");
}

export async function generateStrategy(
  research: NicheResearch,
  angle?: string,
): Promise<ChannelStrategy> {
  const llm = new ViviLLM();
  const result = await llm.generate({
    systemPrompt:
      "Eres un estratega de canales de video en español (LATAM). Creas un canal ORIGINAL, no clones a nadie. Usa los datos de mercado para diferenciarte. Responde en español.",
    userMessage: [
      packResearchForLlm(research),
      angle?.trim() ? `\nÁngulo del creador: ${angle.trim()}` : "",
      "\nDiseña un canal propio: nombre, posicionamiento, pilares, monetización por YouTube/TikTok/Facebook/Bilibili.",
    ].join(""),
    schema: strategySchema,
  });
  return result.data;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export async function generateCalendar(opts: {
  research: NicheResearch;
  strategy: ChannelStrategy;
  videosPerDay: number;
  days?: number;
  startDate?: string;
}): Promise<ContentCalendar> {
  const videosPerDay = Math.min(10, Math.max(1, Math.round(opts.videosPerDay)));
  const dayCount = Math.min(7, Math.max(1, opts.days ?? 7));
  const start = opts.startDate ?? new Date().toISOString().slice(0, 10);

  const llm = new ViviLLM();
  const result = await llm.generate({
    systemPrompt:
      "Eres un planner de contenido short-form en español. Cada pieza debe ser original, específica y publicable. Hashtags sin el símbolo # o con #, consistentes. Títulos cortos. No copies títulos de la competencia palabra por palabra.",
    userMessage: [
      `Canal: ${opts.strategy.channelName} — ${opts.strategy.tagline}`,
      `Audiencia: ${opts.strategy.targetAudience}`,
      `Tono: ${opts.strategy.voiceTone}`,
      `Pilares: ${opts.strategy.contentPillars.map((p) => p.name).join(", ")}`,
      `Nicho: ${opts.research.query}`,
      `Ideas vistas en el mercado:\n${opts.research.ideas
        .slice(0, 12)
        .map((i) => `- ${i}`)
        .join("\n")}`,
      `\nGenera un calendario de ${dayCount} días, ${videosPerDay} video(s) por día (slots 1..${videosPerDay}).`,
      `Fecha inicio: ${start} (YYYY-MM-DD). weekday en español.`,
      "Para CADA item escribe packs distintos para youtube, tiktok, bilibili y facebook (title, description, hashtags).",
      "format: 'short' salvo 1 long por día si videosPerDay >= 4.",
      "Sé breve: title ≤ 70 caracteres, description ≤ 220, máximo 8 hashtags. JSON válido único.",
    ].join("\n"),
    schema: calendarSchema,
  });

  const cal = result.data;
  cal.videosPerDay = videosPerDay;
  cal.days = cal.days.slice(0, dayCount).map((day, i) => ({
    ...day,
    date: /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : addDays(start, i),
    weekday: day.weekday || WEEKDAYS[new Date(`${addDays(start, i)}T12:00:00Z`).getUTCDay()] || "",
    items: day.items.slice(0, videosPerDay).map((item, j) => ({ ...item, slot: j + 1 })),
  }));
  return cal;
}
