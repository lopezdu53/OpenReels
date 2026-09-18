import { describe, expect, it } from "vitest";
import { addDays, fallbackChannel, fallbackMonth, monthDates, weekdayName } from "./engine.js";
import { buildForecast, viewsForItem } from "./forecast.js";
import { bestSlot, formatTime, isWeekend, weeklyHeatmap } from "./hours.js";
import { findCronogramaNiche, listCronogramaNiches } from "./niches.js";
import { channelKitSchema } from "./schemas.js";

describe("cronograma niches", () => {
  it("ships 100 unique ranked niches", () => {
    const list = listCronogramaNiches();
    expect(list).toHaveLength(100);
    expect(new Set(list.map((n) => n.rank)).size).toBe(100);
    expect(new Set(list.map((n) => n.query)).size).toBe(100);
    expect(list[0]?.rank).toBe(1);
    expect(list[99]?.rank).toBe(100);
    expect(list[0]?.cpmLongformUsd).toBeGreaterThan(list[0]?.cpmShortsUsd ?? 0);
    expect(findCronogramaNiche("finanzas personales")?.name).toMatch(/Finanzas/);
  });
});

describe("cronograma forecast and hours", () => {
  it("scales 90-day forecast above month 1", () => {
    const f = buildForecast({
      videosInMonth: 30,
      demand: "alta",
      competition: "media",
      cpmShortsUsd: 0.05,
      nicheName: "IA práctica",
    });
    expect(f.videosInMonth).toBe(30);
    expect(f.day90.base.views).toBeGreaterThan(f.month1.base.views);
    expect(f.month1.optimistic.views).toBeGreaterThan(f.month1.conservative.views);
    expect(f.month1.base.revenueUsd).toBeGreaterThan(0);
    expect(f.assumptions.length).toBeGreaterThan(2);
  });

  it("picks prime night on weekdays and weekend evening", () => {
    expect(isWeekend("2026-09-11")).toBe(false); // Friday
    expect(isWeekend("2026-09-12")).toBe(true); // Saturday
    expect(bestSlot("2026-09-11").hour).toBe(20);
    expect(bestSlot("2026-09-12").hour).toBe(19);
    expect(formatTime(bestSlot("2026-09-11"))).toBe("20:00");
    expect(weeklyHeatmap("America/Mexico_City")).toHaveLength(7);
    const v = viewsForItem({ demand: "alta", competition: "baja", slotScore: 96, format: "short" });
    expect(v.optimistic).toBeGreaterThan(v.base);
  });
});

describe("cronograma fallback plan", () => {
  it("builds a 30-day YouTube-shaped channel without an LLM", () => {
    const niche = findCronogramaNiche("historia shorts")!;
    const channel = fallbackChannel(niche);
    expect(channelKitSchema.parse(channel).handle.startsWith("@")).toBe(true);
    const days = fallbackMonth({
      niche,
      channel,
      startDate: "2026-09-10",
      days: 30,
      videosPerDay: 1,
    });
    expect(days).toHaveLength(30);
    expect(days[0]?.date).toBe("2026-09-10");
    expect(days[29]?.date).toBe("2026-10-09");
    expect(days[0]?.items[0]?.title).toBeTruthy();
    expect(days[0]?.items[0]?.thumbnailPrompt).toContain("thumbnail");
    expect(addDays("2026-09-10", 1)).toBe("2026-09-11");
    expect(weekdayName("2026-09-10")).toBe("jueves");
    expect(monthDates("2026-01-01", 7)).toHaveLength(7);
  });
});
