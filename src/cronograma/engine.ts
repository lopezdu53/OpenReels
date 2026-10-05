import type { LLMProviderKey } from "../schema/providers.js";
import { buildForecast, viewsForItem } from "./forecast.js";
import { bestSlot, formatTime, weeklyHeatmap } from "./hours.js";
import { createCronogramaLlm } from "./llm.js";
import { findCronogramaNiche, listCronogramaNiches } from "./niches.js";
import {
  channelKitSchema,
  type ChannelKit,
  type CronogramaNiche,
  type ScheduleDay,
  type ScheduleItem,
  weekSchema,
} from "./schemas.js";

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekdayName(iso: string): string {
  return WEEKDAYS[new Date(`${iso}T12:00:00`).getDay()] ?? "";
}

export function monthDates(startIso: string, days = 30): string[] {
  return Array.from({ length: days }, (_, i) => addDays(startIso, i));
}

function slugHandle(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  return `@${slug || "canal"}`;
}

export function fallbackChannel(niche: CronogramaNiche): ChannelKit {
  const name = niche.name.replace(/\s*\([^)]*\)\s*/g, " ").trim().slice(0, 42);
  return {
    name,
    handle: slugHandle(name),
    tagline: niche.why.slice(0, 80),
    description: [
      `${name} es un canal en español para LATAM sobre ${niche.query}.`,
      `Aquí no reciclo trends vacíos: cada Short enseña una idea usable. Pilares claros, un gancho en 3 segundos y una miniatura que se lee en el tren.`,
      `Si buscas ${niche.exampleTopics.slice(0, 3).join(", ")}, este es tu sitio. Nuevo video casi todos los días a la hora prime de tu ciudad.`,
    ].join("\n\n"),
    keywords: [niche.query, niche.category, "shorts", "español", "latam", ...niche.exampleTopics],
    country: "MX",
    defaultLanguage: "es",
    youtubeCategory: niche.youtubeCategory,
    voiceTone: "claro, cercano, sin gritar",
    targetAudience: `Adultos 18–40 en LATAM interesados en ${niche.category}`,
    links: [
      { label: "Estudio OpenReels", url: "https://contenido.alfonsolopezd.com" },
      { label: "Comunidad", url: "https://contenido.alfonsolopezd.com/learning" },
    ],
    brandColors: { primary: "#FF0000", accent: "#d8ff00" },
    avatarPrompt: `YouTube channel avatar, bold graphic mark for ${niche.name}, flat vector, high contrast, lime and black, no text, centered icon, 1:1`,
    bannerPrompt: `YouTube channel banner 16:9, cinematic still for ${niche.name}, dark background, one clear subject, space on the left for channel name, no watermarks, photoreal or clean illustration`,
    contentPillars: [
      {
        name: "Dato usable",
        description: "Una idea que se aplica hoy.",
        exampleTopics: niche.exampleTopics.slice(0, 3),
      },
      {
        name: "Mito vs hecho",
        description: "Desmontar lo que todos repiten.",
        exampleTopics: [`mito de ${niche.query}`, "lo que no funciona"],
      },
      {
        name: "Serie",
        description: "Capítulos numerados para que vuelvan.",
        exampleTopics: ["capítulo 1", "recap semanal"],
      },
    ],
    uploadDefaults: {
      visibility: "public",
      madeForKids: false,
      allowComments: true,
      license: "YouTube estándar",
    },
    firstMonthFocus: `Publicar 1 Short diario a las 20:00 locales. Temas: ${niche.exampleTopics.join(", ")}.`,
  };
}

export function fallbackItem(niche: CronogramaNiche, date: string, slot: number, channel: ChannelKit): ScheduleItem {
  const topic = niche.exampleTopics[(slot + date.length) % niche.exampleTopics.length] ?? niche.query;
  const title = `${topic.charAt(0).toUpperCase()}${topic.slice(1)} (en 45s)`;
  const timeSlot = bestSlot(date);
  return {
    slot,
    time: formatTime(timeSlot),
    format: "short",
    pillar: channel.contentPillars[(slot - 1) % channel.contentPillars.length]?.name ?? "Dato usable",
    idea: `Explica «${topic}» con un ejemplo LATAM y un error común.`,
    hook: `Nadie te dijo esto de ${topic}.`,
    title,
    description: `${title}\n\n${channel.name} — ${channel.tagline}\n\n${channel.description.slice(0, 280)}\n\n#shorts #${niche.category}`,
    tags: [niche.query, topic, "shorts", "español", niche.category],
    hashtags: ["#shorts", `#${niche.category}`, "#latam", "#viral"],
    category: niche.youtubeCategory,
    thumbnailText: topic.split(" ").slice(0, 3).join(" ").toUpperCase(),
    thumbnailPrompt: `YouTube Shorts thumbnail 16:9, huge readable text "${topic}", face or object with emotion, high contrast, ${niche.name}, no tiny fonts`,
  };
}

export function fallbackMonth(opts: {
  niche: CronogramaNiche;
  channel: ChannelKit;
  startDate: string;
  days: number;
  videosPerDay: number;
}): ScheduleDay[] {
  return monthDates(opts.startDate, opts.days).map((date) => ({
    date,
    weekday: weekdayName(date),
    items: Array.from({ length: opts.videosPerDay }, (_, i) => fallbackItem(opts.niche, date, i + 1, opts.channel)),
  }));
}

export async function generateChannel(opts: {
  nicheQuery: string;
  llm: string;
  angle?: string;
}): Promise<{ niche: CronogramaNiche; channel: ChannelKit; usedLlm: boolean }> {
  const niche = findCronogramaNiche(opts.nicheQuery) ?? listCronogramaNiches()[0];
  if (!niche) throw new Error("No hay nichos cargados");
  const fallback = fallbackChannel(niche);
  try {
    const llm = createCronogramaLlm(opts.llm as LLMProviderKey);
    const result = await llm.generate({
      systemPrompt:
        "Eres director de canal YouTube LATAM 2026. Creas un canal ORIGINAL (nombre, handle, bio). Español. JSON único. La descripción parece la pestaña Acerca de YouTube (2–4 párrafos). avatarPrompt y bannerPrompt en inglés, listos para un generador de imágenes. handle empieza con @. No copies marcas.",
      userMessage: [
        `Nicho: ${niche.name} (${niche.query}). Categoría YouTube: ${niche.youtubeCategory}.`,
        `Por qué existe: ${niche.why}`,
        `Temas: ${niche.exampleTopics.join(", ")}`,
        opts.angle?.trim() ? `Ángulo del creador: ${opts.angle.trim()}` : "",
        "País por defecto MX, idioma es. Colores de marca hex. 3–5 pilares. uploadDefaults: public, not for kids, comments on.",
      ].join("\n"),
      schema: channelKitSchema,
    });
    const channel = channelKitSchema.parse(result.data);
    if (!channel.handle.startsWith("@")) channel.handle = `@${channel.handle.replace(/^@/, "")}`;
    return { niche, channel, usedLlm: true };
  } catch {
    return { niche, channel: fallback, usedLlm: false };
  }
}

async function generateWeek(opts: {
  niche: CronogramaNiche;
  channel: ChannelKit;
  dates: string[];
  videosPerDay: number;
  llm: string;
}): Promise<ScheduleDay[]> {
  const fallback = opts.dates.map((date) => ({
    date,
    weekday: weekdayName(date),
    items: Array.from({ length: opts.videosPerDay }, (_, i) => fallbackItem(opts.niche, date, i + 1, opts.channel)),
  }));
  try {
    const llm = createCronogramaLlm(opts.llm as LLMProviderKey);
    const result = await llm.generate({
      systemPrompt:
        "Planner de YouTube Shorts LATAM. Cada pieza es original, específica y publicable. Títulos ≤ 70 caracteres. description estilo YouTube (gancho + valor + CTA + hashtags). thumbnailText 2–5 palabras en MAYÚSCULAS. thumbnailPrompt en inglés. time en HH:MM. JSON único.",
      userMessage: [
        `Canal: ${opts.channel.name} ${opts.channel.handle} — ${opts.channel.tagline}`,
        `Tono: ${opts.channel.voiceTone}. Audiencia: ${opts.channel.targetAudience}`,
        `Pilares: ${opts.channel.contentPillars.map((p) => p.name).join(", ")}`,
        `Nicho: ${opts.niche.name}. Temas semilla: ${opts.niche.exampleTopics.join(", ")}`,
        `Genera ${opts.dates.length} días, ${opts.videosPerDay} video(s) por día.`,
        `Fechas (usa estas, no inventes otras): ${opts.dates.join(", ")}`,
        "Hora: 20:00 entre semana y 19:00 fin de semana salvo que el tema pida mediodía.",
        "category = categoría YouTube en inglés. tags 6–10. hashtags 4–8.",
      ].join("\n"),
      schema: weekSchema,
    });
    const week = weekSchema.parse(result.data);
    return opts.dates.map((date, i) => {
      const raw = week.days.find((d) => d.date === date) ?? week.days[i];
      const items = (raw?.items ?? []).slice(0, opts.videosPerDay);
      const filled =
        items.length > 0
          ? items.map((item, j) => ({ ...item, slot: j + 1, time: item.time || formatTime(bestSlot(date)) }))
          : fallback[i]!.items;
      return { date, weekday: weekdayName(date), items: filled };
    });
  } catch {
    return fallback;
  }
}

export interface CronogramaPlan {
  niche: CronogramaNiche;
  channel: ChannelKit;
  timezone: string;
  videosPerDay: number;
  startDate: string;
  days: Array<
    ScheduleDay & {
      items: Array<
        ScheduleItem & {
          predictedViews: { conservative: number; base: number; optimistic: number };
          slotScore: number;
        }
      >;
    }
  >;
  forecast: ReturnType<typeof buildForecast>;
  hours: ReturnType<typeof weeklyHeatmap>;
  usedLlm: boolean;
}

function decorateDays(days: ScheduleDay[], niche: CronogramaNiche): CronogramaPlan["days"] {
  return days.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      const slot = bestSlot(day.date);
      const predictedViews = viewsForItem({
        demand: niche.demand,
        competition: niche.competition,
        slotScore: slot.score,
        format: item.format,
      });
      return { ...item, predictedViews, slotScore: slot.score };
    }),
  }));
}

export async function generateMonthPlan(opts: {
  nicheQuery: string;
  llm: string;
  angle?: string;
  startDate?: string;
  days?: number;
  videosPerDay?: number;
  timezone?: string;
  channel?: ChannelKit;
}): Promise<CronogramaPlan> {
  const videosPerDay = Math.min(3, Math.max(1, Math.round(opts.videosPerDay ?? 1)));
  const dayCount = Math.min(31, Math.max(7, opts.days ?? 30));
  const startDate = opts.startDate ?? new Date().toISOString().slice(0, 10);
  const timezone = opts.timezone ?? "America/Mexico_City";

  const built = opts.channel
    ? {
        niche: findCronogramaNiche(opts.nicheQuery) ?? listCronogramaNiches()[0]!,
        channel: opts.channel,
        usedLlm: true,
      }
    : await generateChannel({ nicheQuery: opts.nicheQuery, llm: opts.llm, angle: opts.angle });

  const dates = monthDates(startDate, dayCount);
  const weeks: string[][] = [];
  for (let i = 0; i < dates.length; i += 7) weeks.push(dates.slice(i, i + 7));

  const days: ScheduleDay[] = [];
  let usedLlm = built.usedLlm;
  for (const chunk of weeks) {
    const part = await generateWeek({
      niche: built.niche,
      channel: built.channel,
      dates: chunk,
      videosPerDay,
      llm: opts.llm,
    });
    if (part.every((d) => d.items[0]?.title.includes("(en 45s)"))) usedLlm = false;
    days.push(...part);
  }

  const decorated = decorateDays(days, built.niche);
  return {
    niche: built.niche,
    channel: built.channel,
    timezone,
    videosPerDay,
    startDate,
    days: decorated,
    forecast: buildForecast({
      videosInMonth: dayCount * videosPerDay,
      demand: built.niche.demand,
      competition: built.niche.competition,
      cpmShortsUsd: built.niche.cpmShortsUsd,
      nicheName: built.niche.name,
    }),
    hours: weeklyHeatmap(timezone),
    usedLlm,
  };
}
