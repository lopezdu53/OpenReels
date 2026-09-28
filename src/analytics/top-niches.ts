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
  {
    name: "True crime en 60s",
    query: "true crime casos reales",
    why: "Retención altísima; gana quien resume un caso con fuente y cierre moral.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["caso resuelto", "error del detective", "prueba que cambió todo"],
    formats: ["short"],
  },
  {
    name: "Fútbol LATAM (jugadas)",
    query: "fútbol highlights latinoamérica",
    why: "Picos de búsqueda cada jornada; recortes cortos viajan a TikTok.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["gol de la fecha", "error arbitral", "promesa sub-20"],
    formats: ["short"],
  },
  {
    name: "Inglés en 60 segundos",
    query: "aprender inglés shorts",
    why: "Intención de estudio diaria y series fáciles de serializar.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["phrasal verb", "error de pronunciación", "frase para entrevista"],
    formats: ["short", "long"],
  },
  {
    name: "Mascotas y cuidados",
    query: "perros gatos cuidados",
    why: "Share emocional alto; bajo costo si filmas en casa.",
    demand: "alta",
    competition: "media",
    exampleTopics: ["señal de estrés", "snack casero", "primer día con cachorro"],
    formats: ["short"],
  },
  {
    name: "Autos usados sin estafa",
    query: "autos usados consejos",
    why: "Intención comercial y CPM de research; un checklist por video.",
    demand: "media",
    competition: "media",
    exampleTopics: ["qué revisar", "precio justo", "documentos"],
    formats: ["short", "long"],
  },
  {
    name: "Viajes baratos LATAM",
    query: "viajes baratos latinoamérica",
    why: "Temporadas claras y hooks de precio; fácil de clonar por ciudad.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["vuelo error fare", "hostel vs airbnb", "ciudad 3 días"],
    formats: ["short"],
  },
  {
    name: "Psicología cotidiana",
    query: "psicología cotidiana",
    why: "Alto share si evitas diagnóstico y das un experimento de 24h.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["sesgo de confirmación", "cómo decir no", "rumiación"],
    formats: ["short"],
  },
  {
    name: "DIY hogar / reparación",
    query: "reparar casa bricolaje",
    why: "Búsqueda con intención; un arreglo por short convierte bien.",
    demand: "media",
    competition: "media",
    exampleTopics: ["fuga", "pintura", "organizar 1 cajón"],
    formats: ["short"],
  },
  {
    name: "Estafas digitales",
    query: "estafas whatsapp criptomonedas",
    why: "Urgencia real; un patrón de fraude por video y CTA de cuidado.",
    demand: "alta",
    competition: "media",
    exampleTopics: ["falso soporte", "inversión milagro", "QR tramposo"],
    formats: ["short"],
  },
  {
    name: "Exámenes y becas",
    query: "exámenes becas estudio",
    why: "Ciclos escolares; audiencia joven con series de etapa.",
    demand: "media",
    competition: "media",
    exampleTopics: ["truco de memoria", "calendario beca", "error en el examen"],
    formats: ["short", "long"],
  },
  {
    name: "Comedia de oficina LATAM",
    query: "comedia oficina trabajo",
    why: "Relatable y barato de producir; un gag por reunión.",
    demand: "media",
    competition: "media",
    exampleTopics: ["lunes zoom", "jefe que no lee", "vacaciones denegadas"],
    formats: ["short"],
  },
  {
    name: "Nutrición sin milagros",
    query: "nutrición hábitos comida",
    why: "Demanda estable si evitas dietas milagro y das un swap por video.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["azúcar escondida", "almuerzo oficina", "leer etiquetas"],
    formats: ["short"],
  },
  {
    name: "Cine y series explicados",
    query: "películas explicadas finales",
    why: "Picos con estrenos; un final o detalle por short.",
    demand: "alta",
    competition: "alta",
    exampleTopics: ["final explicado", "easter egg", "obra vs libro"],
    formats: ["short"],
  },
  {
    name: "Padres primerizos",
    query: "bebés padres primerizos",
    why: "Búsqueda angustiada 3am; tono empático y un tip accionable.",
    demand: "alta",
    competition: "media",
    exampleTopics: ["sueño", "cólicos", "primer viaje"],
    formats: ["short"],
  },
];

function hashSalt(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function isoWeek(at: Date): number {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function seededShuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed || 1;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    const a = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = a;
  }
  return arr;
}

export function rotateCuratedSeeds(opts?: { at?: Date; salt?: string; count?: number }): NicheSeed[] {
  const at = opts?.at ?? new Date();
  const count = opts?.count ?? 10;
  const seed = isoWeek(at) * 10_000 + at.getUTCFullYear() + hashSalt(opts?.salt ?? "");
  return seededShuffle(CURATED_NICHE_SEEDS, seed).slice(0, Math.min(count, CURATED_NICHE_SEEDS.length));
}

export function curatedTopNiches(
  region = "LATAM",
  opts?: { at?: Date; salt?: string },
): TopNiches {
  const seeds = rotateCuratedSeeds(opts);
  return {
    region,
    source: "curated",
    niches: seeds.map((seed, i) => ({
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
  salt?: string;
}): Promise<TopNiches> {
  const region = opts?.region?.trim() || "LATAM";
  const fallback = curatedTopNiches(region, { salt: opts?.salt ?? opts?.seed });
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
        `Región: ${region}. Fecha: ${new Date().toISOString().slice(0, 10)}.`,
        "Explora nichos EN TENDENCIA esta semana. No copies el top de siempre (finanzas/IA/historia).",
        opts?.seed?.trim() ? `Enfoque extra: ${opts.seed.trim()}` : "",
        opts?.salt?.trim() ? `Variación: ${opts.salt.trim()}` : "",
        "Semilla rotada (reescribe 4–8 si hay mejor señal de tendencia):",
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
