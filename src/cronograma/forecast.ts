import { estimateAdRevenueUsd } from "../analytics/youtube.js";
import type { Demand } from "./hours.js";

export interface ForecastBand {
  views: number;
  subscribers: number;
  revenueUsd: number;
}

export interface ChannelForecast {
  videosInMonth: number;
  cpmShortsUsd: number;
  assumptions: string[];
  month1: { conservative: ForecastBand; base: ForecastBand; optimistic: ForecastBand };
  day90: { conservative: ForecastBand; base: ForecastBand; optimistic: ForecastBand };
  yppHint: string;
}

function demandMul(level: Demand): number {
  if (level === "alta") return 1.28;
  if (level === "baja") return 0.72;
  return 1;
}

function competitionMul(level: Demand): number {
  if (level === "alta") return 0.68;
  if (level === "baja") return 1.22;
  return 1;
}

function band(views: number, cpm: number, subRate: number): ForecastBand {
  const clean = Math.max(0, Math.round(views));
  return {
    views: clean,
    subscribers: Math.round(clean * subRate),
    revenueUsd: Number(estimateAdRevenueUsd(clean, cpm).toFixed(2)),
  };
}

export function buildForecast(opts: {
  videosInMonth: number;
  demand: Demand;
  competition: Demand;
  cpmShortsUsd: number;
  nicheName: string;
}): ChannelForecast {
  const videos = Math.min(62, Math.max(4, Math.round(opts.videosInMonth)));
  const mix = demandMul(opts.demand) * competitionMul(opts.competition);
  const perVideo = { conservative: 700, base: 3200, optimistic: 16000 };
  const m1 = {
    conservative: band(perVideo.conservative * videos * mix, opts.cpmShortsUsd, 0.01),
    base: band(perVideo.base * videos * mix, opts.cpmShortsUsd, 0.022),
    optimistic: band(perVideo.optimistic * videos * mix, opts.cpmShortsUsd, 0.045),
  };
  const grow = { conservative: 3.1, base: 4.4, optimistic: 6.2 };
  const day90 = {
    conservative: band(m1.conservative.views * grow.conservative, opts.cpmShortsUsd, 0.011),
    base: band(m1.base.views * grow.base, opts.cpmShortsUsd, 0.024),
    optimistic: band(m1.optimistic.views * grow.optimistic, opts.cpmShortsUsd, 0.048),
  };
  return {
    videosInMonth: videos,
    cpmShortsUsd: opts.cpmShortsUsd,
    assumptions: [
      `Nicho «${opts.nicheName}»: demanda ${opts.demand}, competencia ${opts.competition}.`,
      `${videos} Shorts en 30 días. CPM Shorts ≈ $${opts.cpmShortsUsd.toFixed(2)} / 1k views (heurística) × 55% creador.`,
      "Mes 1: el algoritmo aún prueba. 90 días asume consistencia (mismo horario, ganchos claros) y 1–2 series.",
      "Lo optimista exige thumbnails legibles, título con promesa y retención >50% en los primeros 3s.",
      "No incluye Super Chat, membresías ni marcas. YPP pide 1.000 subs y 10M Shorts views / 90 días o 4.000h long.",
    ],
    month1: m1,
    day90,
    yppHint:
      day90.optimistic.views >= 10_000_000
        ? "En el escenario alto podrías rozar el umbral de Shorts del YPP a 90 días si el 70%+ es tráfico de Shorts."
        : "A 90 días el YPP por Shorts (10M views) es difícil; apunta a hábito y un long semanal para las 4.000 horas.",
  };
}

export function viewsForItem(opts: {
  demand: Demand;
  competition: Demand;
  slotScore: number;
  format: "short" | "long";
}): { conservative: number; base: number; optimistic: number } {
  const mix = demandMul(opts.demand) * competitionMul(opts.competition) * (opts.slotScore / 90);
  const fmt = opts.format === "long" ? 2.4 : 1;
  return {
    conservative: Math.round(550 * mix * fmt),
    base: Math.round(2800 * mix * fmt),
    optimistic: Math.round(14000 * mix * fmt),
  };
}
