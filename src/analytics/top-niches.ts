import { ViviLLM } from "../providers/llm/vivi.js";
import { type TopNiches, topNichesSchema } from "./schemas.js";
import { cpmFor, tavilySearch } from "./youtube.js";

interface NicheSeed {
  name: string;
  query: string;
  why: string;
  demand: "alta" | "media" | "baja";
  competition: "alta" | "media" | "baja";
  exampleTopics: string[];
  formats: string[];
}

/** Seed ranking for Spanish LATAM Shorts — CPM filled at runtime. */
export const CURATED_NICHE_SEEDS: NicheSeed[] = [
  {
    name: "Finanzas personales LATAM",
    query: "finanzas personales",
    why: "Alto CPM y búsqueda constante de deudas, ahorro y primer crédito.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["cómo salir de deudas", "tarjeta vs efectivo", "fondo de emergencia"],
    formats: ["short", "long"],
  },
  {
    name: "IA práctica (sin jerga)",
    query: "inteligencia artificial",
    why: "Demanda explosiva; gana quien enseña un truco usable en 60s.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["prompt que ahorra 1 hora", "IA para el trabajo", "estafas con IA"],
    formats: ["short"],
  },
  {
    name: "Historia en 60 segundos",
    query: "historia",
    why: "Evergreen, fácil de serializar y reutilizar en 4 plataformas.",
    demand: "alta",
    competition: "media",
    exampleTopics: ["emperadores", "inventos olvidados", "mitos vs hechos"],
    formats: ["short"],
  },
  {
    name: "Recetas rápidas",
    query: "recetas rápidas",
    why: "Retención visual alta; shorts de cocina viajan bien a TikTok y Facebook.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["cena en 15 min", "meal prep barato", "postre 3 ingredientes"],
    formats: ["short"],
  },
  {
    name: "Skincare / belleza",
    query: "belleza skincare",
    why: "CPM de belleza alto y marcas dispuestas a canje.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["rutina de noche", "ingrediente vs mito", "piel grasa LATAM"],
    formats: ["short"],
  },
  {
    name: "Productividad y estudio",
    query: "productividad estudio",
    why: "Audiencia joven, bajo costo de producción, series fáciles.",
    demand: "media",
    competition: "media",
    exampleTopics: ["técnica pomodoro", "apuntes en 1 hoja", "cómo concentrarse"],
    formats: ["short", "long"],
  },
  {
    name: "Videojuegos indie",
    query: "videojuegos indie",
    why: "Comunidad fiel; menos saturado que AAA si el recorte es específico.",
    demand: "media",
    competition: "media",
    exampleTopics: ["juegos baratos", "hidden gems", "tips de un boss"],
    formats: ["short", "long"],
  },
  {
    name: "Salud cotidiana (no médica)",
    query: "salud hábitos",
    why: "Búsqueda diaria de sueño, energía y movimiento; evita consejos clínicos.",
    demand: "alta",
    competition: "media",
    exampleTopics: ["dormir mejor", "caminar 8k pasos", "hidratarse"],
    formats: ["short"],
  },
  {
    name: "Negocios chicos / side hustle",
    query: "negocios por internet",
    why: "Intención comercial y CPM de finance/education mezclado.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["primera venta", "precios", "errores al emprender"],
    formats: ["short", "long"],
  },
  {
    name: "Ciencia curiosa",
    query: "ciencia",
    why: "Alto share; un dato sorprendente por video escala en Shorts.",
    demand: "media",
    competition: "media",
    exampleTopics: ["por qué el cielo es azul", "el cerebro en 60s", "espacio"],
    formats: ["short"],
  },
];

export function curatedTopNiches(region = "LATAM"): TopNiches {
  return {
    region,
    source: "curated",
    niches: CURATED_NICHE_SEEDS.map((seed, i) => ({
      rank: i + 1,
      ...seed,
      cpmLongformUsd: cpmFor(seed.query, false),
      cpmShortsUsd: cpmFor(seed.query, true),
    })),
  };
}

export async function generateTopNiches(opts?: {
  region?: string;
  seed?: string;
}): Promise<TopNiches> {
  const region = opts?.region?.trim() || "LATAM";
  const fallback = curatedTopNiches(region);
  if (!process.env["VIVI_LLM_API_KEY"]) return fallback;

  let web = "";
  try {
    const hits = await tavilySearch(
      `nichos YouTube Shorts ${region} 2026 más rentables suscriptores`,
      6,
    );
    web = hits.map((h) => `- ${h.title}: ${h.content.slice(0, 160)}`).join("\n");
  } catch {
    web = "";
  }

  try {
    const llm = new ViviLLM();
    const result = await llm.generate({
      systemPrompt:
        "Eres analista de nichos YouTube/TikTok para creadores LATAM. Ranking original, no copies marcas. Español. JSON único. Exactamente 10 nichos, ranks 1..10. query debe servir para buscar en YouTube.",
      userMessage: [
        `Región: ${region}. Año: 2026.`,
        opts?.seed?.trim() ? `Enfoque extra: ${opts.seed.trim()}` : "",
        "Semilla (puedes reordenar, fusionar o sustituir 1–3 si hay mejor señal):",
        fallback.niches
          .map((n) => `${n.rank}. ${n.name} (query: ${n.query}) — ${n.why}`)
          .join("\n"),
        web ? `\nSeñales web:\n${web}` : "",
        "cpmLongformUsd y cpmShortsUsd: números realistas USD / 1k views (shorts mucho más bajos).",
      ]
        .filter(Boolean)
        .join("\n"),
      schema: topNichesSchema,
    });
    const data = result.data;
    data.region = region;
    data.source = web ? "mixed" : "vivi";
    data.niches = data.niches.slice(0, 10).map((n, i) => ({
      ...n,
      rank: i + 1,
      cpmLongformUsd: n.cpmLongformUsd || cpmFor(n.query, false),
      cpmShortsUsd: n.cpmShortsUsd || cpmFor(n.query, true),
    }));
    return data;
  } catch (err) {
    fallback.source = "curated";
    fallback.warning = `Vivi: ${err instanceof Error ? err.message : String(err)}. Mostrando ranking curado.`;
    return fallback;
  }
}
