import { describe, expect, it } from "vitest";
import {
  cadenceLabel,
  channelAgeDays,
  cpmFor,
  estimateAdRevenueUsd,
  guessNicheKey,
  isShortsDuration,
  parseIsoDurationSeconds,
  uploadsPerWeek,
} from "./youtube.js";

describe("analytics revenue helpers", () => {
  it("parses ISO-8601 durations", () => {
    expect(parseIsoDurationSeconds("PT45S")).toBe(45);
    expect(parseIsoDurationSeconds("PT1M30S")).toBe(90);
    expect(parseIsoDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(isShortsDuration(60)).toBe(true);
    expect(isShortsDuration(240)).toBe(false);
  });

  it("picks CPM by niche keywords", () => {
    expect(guessNicheKey("historia de roma")).toBe("history");
    expect(guessNicheKey("finanzas personales")).toBe("finance");
    expect(guessNicheKey("videojuegos indie")).toBe("gaming");
    expect(cpmFor("personal finance tips", false)).toBeGreaterThan(
      cpmFor("gaming highlights", false),
    );
  });

  it("estimates creator ad share at 55%", () => {
    // 100_000 views * $5 CPM * 0.55 = $275
    expect(estimateAdRevenueUsd(100_000, 5)).toBeCloseTo(275);
    expect(estimateAdRevenueUsd(0, 5)).toBe(0);
  });

  it("estimates channel age and upload cadence", () => {
    const now = Date.UTC(2026, 8, 1);
    const yearAgo = new Date(now - 365 * 86_400_000).toISOString();
    expect(channelAgeDays(yearAgo, now)).toBe(365);
    expect(uploadsPerWeek(365, yearAgo, now)).toBeCloseTo(7, 0);
    expect(cadenceLabel(7)).toMatch(/día/);
    expect(cadenceLabel(2)).toMatch(/semana/);
    expect(cadenceLabel(0.5)).toMatch(/cada/);
  });
});
