import { describe, expect, it } from "vitest";
import {
  calendarSchema,
  clonedChannelSchema,
  clonedContentSchema,
  strategySchema,
} from "./schemas.js";

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

  it("accepts a cloned channel and cloned content pack", () => {
    const cloned = clonedChannelSchema.parse({
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
      sourceChannel: "Historia X",
      polishNotes: "Nuevo nombre y tono más cercano.",
      firstVideos: [
        { title: "El acueducto que nadie explica", hook: "Llevaba agua 50 km", format: "short" },
        { title: "César no dijo eso", hook: "Una cita falsa", format: "short" },
        { title: "Por qué cayó Roma en 60s", hook: "No fue un día", format: "short" },
      ],
    });
    expect(cloned.sourceChannel).toBe("Historia X");
    expect(
      clonedContentSchema.parse({
        sourceTitle: "Video original",
        sourceChannel: "Canal X",
        polishNotes: "Hook propio",
        hook: "Dato en 3s",
        script: "Texto de locución.",
        visualNotes: "B-roll de ruinas",
        youtube: pack,
        tiktok: pack,
        bilibili: pack,
        facebook: pack,
      }).hook,
    ).toBe("Dato en 3s");
  });
});
