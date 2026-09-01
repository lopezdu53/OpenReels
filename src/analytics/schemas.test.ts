import { describe, expect, it } from "vitest";
import { calendarSchema, strategySchema } from "./schemas.js";

const pack = { title: "Título corto", description: "Desc", hashtags: ["#a", "#b"] };

describe("analytics schemas", () => {
  it("accepts a channel strategy", () => {
    const parsed = strategySchema.parse({
      channelName: "Roma en 60s",
      tagline: "Historia sin aburrir",
      positioning: "Shorts de historia romana para LATAM",
      targetAudience: "18-35 curiosos",
      voiceTone: "cercano",
      contentPillars: [
        { name: "Datos", description: "dato sorprendente", exampleTopics: ["acueductos"] },
        { name: "Personajes", description: "vidas", exampleTopics: ["César"] },
        { name: "Mitos", description: "desmentir", exampleTopics: ["saludos"] },
      ],
      differentiation: ["español neutro"],
      monetization: {
        youtube: "ads + membresías",
        tiktok: "creator fund",
        facebook: "reels ads",
        bilibili: "rewards",
      },
      firstMonthFocus: "30 shorts de emperadores",
      postingCadence: "3 al día",
    });
    expect(parsed.contentPillars).toHaveLength(3);
  });

  it("accepts a 1-day calendar with four platform packs", () => {
    const parsed = calendarSchema.parse({
      channelName: "Roma en 60s",
      videosPerDay: 1,
      days: [
        {
          date: "2026-09-01",
          weekday: "martes",
          items: [
            {
              slot: 1,
              topic: "Acueductos",
              pillar: "Datos",
              format: "short",
              youtube: pack,
              tiktok: pack,
              bilibili: pack,
              facebook: pack,
            },
          ],
        },
      ],
    });
    expect(parsed.days[0]?.items[0]?.youtube.title).toBe("Título corto");
  });
});
