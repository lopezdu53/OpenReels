import { describe, expect, it } from "vitest";
import { clonedChannelSchema } from "../../analytics/schemas.js";
import { parseLlmJson, prepareLlmJson } from "./json-extract.js";

describe("LLM JSON unwrap + aliases", () => {
  it("unwraps a nested canal object with Spanish keys", () => {
    const parsed = prepareLlmJson({
      canal: {
        nombre: "Plata Clara",
        eslogan: "Finanzas sin humo",
        posicionamiento: "Shorts de dinero para LATAM",
        audiencia: "25-40",
        tono: "cercano",
        pilares: ["deudas", "ahorro", "inversión"],
        diferenciacion: "sin guru",
        monetizacion: "ads",
        enfoquePrimerMes: "30 shorts",
        cadencia: "4 al día",
        canalFuente: "Eduardo Rosas",
        notas: "Nombre nuevo",
        primerosVideos: [
          { titulo: "Tu primera deuda", gancho: "No es el banco", formato: "corto" },
          { title: "Ahorro feo", hook: "1 sobre", format: "short" },
          { title: "Inversión 101", hook: "Sin Excel", format: "short" },
        ],
      },
    });
    const cloned = clonedChannelSchema.parse(parsed);
    expect(cloned.channelName).toBe("Plata Clara");
    expect(cloned.tagline).toBe("Finanzas sin humo");
    expect(cloned.contentPillars).toHaveLength(3);
    expect(cloned.firstVideos[0]?.format).toBe("short");
    expect(cloned.monetization.youtube).toBe("ads");
  });

  it("camelizes snake_case wrappers", () => {
    const cloned = parseLlmJson(clonedChannelSchema, {
      channel_name: "X",
      tagline: "T",
      positioning: "P",
      target_audience: "A",
      voice_tone: "V",
      content_pillars: [
        { name: "A", description: "a", example_topics: ["1"] },
        { name: "B", description: "b", example_topics: ["2"] },
        { name: "C", description: "c", example_topics: ["3"] },
      ],
      differentiation: ["d"],
      monetization: {
        youtube: "y",
        tiktok: "t",
        facebook: "f",
        bilibili: "b",
      },
      first_month_focus: "m",
      posting_cadence: "4/día",
      source_channel: "Src",
      polish_notes: "nuevo",
      first_videos: [
        { title: "1", hook: "h1", format: "short" },
        { title: "2", hook: "h2", format: "short" },
        { title: "3", hook: "h3", format: "long" },
      ],
    });
    expect(cloned.channelName).toBe("X");
    expect(cloned.targetAudience).toBe("A");
    expect(cloned.firstVideos[2]?.format).toBe("long");
  });
});
