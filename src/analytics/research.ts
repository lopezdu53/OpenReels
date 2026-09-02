import { ViviLLM } from "../providers/llm/vivi.js";
import {
  type ChannelStrategy,
  type ClonedChannel,
  type ClonedContent,
  type ContentCalendar,
  calendarSchema,
  clonedChannelSchema,
  clonedContentSchema,
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

function packChannelForClone(channel: AnalyticsChannel, videos: AnalyticsVideo[]): string {
  const vids = videos
    .slice(0, 10)
    .map(
      (v) =>
        `- ${v.title} [${v.shorts ? "Short" : "long"}] ${v.views.toLocaleString()} views — ${v.description.slice(0, 120)}`,
    )
    .join("\n");
  return [
    `Canal fuente (referencia, NO copiar nombre ni identidad): ${channel.title}`,
    channel.handle ? `Handle: ${channel.handle}` : "",
    `Subs: ${channel.subscribers.toLocaleString()} · views: ${channel.views.toLocaleString()} · videos: ${channel.videoCount}`,
    `Bio: ${channel.description.slice(0, 400)}`,
    "",
    "Videos top:",
    vids || "(sin lista de videos)",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function cloneChannel(opts: {
  channel: AnalyticsChannel;
  videos?: AnalyticsVideo[];
  niche?: string;
  polish?: string;
}): Promise<ClonedChannel> {
  let videos = opts.videos ?? [];
  if (videos.length === 0 && opts.channel.id) {
    try {
      videos = await channelVideos(opts.channel.id, opts.niche ?? opts.channel.title, 8);
    } catch {
      videos = [];
    }
  }
  const llm = new ViviLLM();
  const result = await llm.generate({
    systemPrompt:
      "Eres un productor de canales LATAM. Clonas el FORMATO (pilares, ritmo, tipo de hook), nunca la identidad: nombre, cara, eslogan y títulos literales deben ser nuevos. Pulir = más claro, más específico, voz propia. Español. JSON único.",
    userMessage: [
      opts.niche ? `Nicho: ${opts.niche}` : "",
      packChannelForClone(opts.channel, videos),
      opts.polish?.trim()
        ? `\nCómo pulirlo: ${opts.polish.trim()}`
        : "\nPúlelo: tono cercano, títulos propios, diferenciación clara.",
      "sourceChannel = nombre del canal de referencia (string).",
      "polishNotes = qué cambiaste vs el original (string).",
      "firstVideos = array de 5–8 {title, hook, format:'short'|'long'} ideas NUEVAS.",
      "Claves exactas camelCase: channelName, tagline, positioning, targetAudience, voiceTone, contentPillars, differentiation, monetization, firstMonthFocus, postingCadence, sourceChannel, polishNotes, firstVideos.",
      "contentPillars = [{name, description, exampleTopics: string[]}]. monetization = {youtube, tiktok, facebook, bilibili}.",
      "Responde un JSON plano (sin envolver en canal/cloned).",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: clonedChannelSchema,
  });
  return result.data;
}

export async function cloneContent(opts: {
  video: AnalyticsVideo;
  niche?: string;
  polish?: string;
}): Promise<ClonedContent> {
  const v = opts.video;
  const llm = new ViviLLM();
  const result = await llm.generate({
    systemPrompt:
      "Reescribes un video de referencia para un canal propio. El resultado debe ser publicable y ORIGINAL: no copies el título palabra por palabra ni la descripción. Pulir = hook más fuerte, script hablable en voz alta, hashtags por plataforma. Español LATAM. JSON único.",
    userMessage: [
      opts.niche ? `Nicho: ${opts.niche}` : "",
      `Video fuente: ${v.title}`,
      v.channelTitle ? `Canal: ${v.channelTitle}` : "",
      `Formato: ${v.shorts ? "short" : "long"} · ${v.views.toLocaleString()} views`,
      `Descripción: ${v.description.slice(0, 400)}`,
      v.tags.length ? `Tags: ${v.tags.join(", ")}` : "",
      opts.polish?.trim()
        ? `\nCómo pulirlo: ${opts.polish.trim()}`
        : "\nPúlelo: más concreto, un solo dato sorprendente, CTA suave.",
      "script = locución 80–160 palabras si short, o 180–280 si long.",
      "Packs distintos para youtube, tiktok, bilibili, facebook (title, description, hashtags).",
      "sourceTitle y sourceChannel recuerdan la referencia; polishNotes explica el cambio.",
      "Claves camelCase exactas: sourceTitle, sourceChannel, polishNotes, hook, script, visualNotes, youtube, tiktok, bilibili, facebook.",
      "Cada pack de plataforma: {title, description, hashtags: string[]}. JSON plano, sin envolver.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: clonedContentSchema,
  });
  const data = result.data;
  if (!data.sourceTitle) data.sourceTitle = v.title;
  if (!data.sourceChannel) data.sourceChannel = v.channelTitle ?? "";
  return data;
}
