import { z } from "zod";

const WRAPPERS = [
  "cloned",
  "clonedChannel",
  "channel",
  "canal",
  "data",
  "result",
  "strategy",
  "content",
  "video",
  "clone",
  "output",
  "payload",
];

const TOP_ALIASES: Record<string, string> = {
  nombre: "channelName",
  nombreCanal: "channelName",
  name: "channelName",
  eslogan: "tagline",
  slogan: "tagline",
  lema: "tagline",
  posicionamiento: "positioning",
  audiencia: "targetAudience",
  publicoObjetivo: "targetAudience",
  publico: "targetAudience",
  tono: "voiceTone",
  tonoVoz: "voiceTone",
  pilares: "contentPillars",
  pilaresDeContenido: "contentPillars",
  diferenciacion: "differentiation",
  monetizacion: "monetization",
  enfoquePrimerMes: "firstMonthFocus",
  primerMes: "firstMonthFocus",
  cadencia: "postingCadence",
  frecuencia: "postingCadence",
  canalFuente: "sourceChannel",
  notas: "polishNotes",
  notasPulido: "polishNotes",
  primerosVideos: "firstVideos",
  tituloFuente: "sourceTitle",
  guion: "script",
  notasVisuales: "visualNotes",
};

export function unwrapLlmObject(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return parsed;
  const o = parsed as Record<string, unknown>;
  for (const w of WRAPPERS) {
    const inner = o[w];
    if (inner && typeof inner === "object" && !Array.isArray(inner)) return inner;
  }
  const keys = Object.keys(o);
  if (
    keys.length === 1 &&
    o[keys[0]!] &&
    typeof o[keys[0]!] === "object" &&
    !Array.isArray(o[keys[0]!])
  ) {
    return o[keys[0]!];
  }
  return parsed;
}

export function camelizeKeys(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(camelizeKeys);
  if (!input || typeof input !== "object") return input;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const camel = k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = camelizeKeys(v);
  }
  return out;
}

export function applyTopAliases(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  for (const [from, to] of Object.entries(TOP_ALIASES)) {
    if ((o[to] == null || o[to] === "") && o[from] != null) o[to] = o[from];
  }
  return o;
}

function asString(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function coercePillars(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((item) => {
    if (typeof item === "string") {
      return { name: item, description: item, exampleTopics: [] };
    }
    if (item && typeof item === "object") {
      const p = item as Record<string, unknown>;
      return {
        name: asString(p["name"] ?? p["nombre"] ?? p["title"]),
        description: asString(p["description"] ?? p["descripcion"] ?? p["desc"] ?? p["name"]),
        exampleTopics: Array.isArray(p["exampleTopics"])
          ? p["exampleTopics"].map(asString)
          : Array.isArray(p["examples"])
            ? (p["examples"] as unknown[]).map(asString)
            : [],
      };
    }
    return item;
  });
}

function coerceVideos(raw: unknown): unknown {
  if (!Array.isArray(raw)) return raw;
  return raw.map((item) => {
    if (typeof item === "string") {
      return { title: item, hook: item, format: "short" };
    }
    if (item && typeof item === "object") {
      const v = item as Record<string, unknown>;
      const formatRaw = asString(v["format"] ?? v["formato"]).toLowerCase();
      const format = formatRaw.startsWith("long") || formatRaw === "largo" ? "long" : "short";
      return {
        title: asString(v["title"] ?? v["titulo"] ?? v["nombre"]),
        hook: asString(v["hook"] ?? v["gancho"]),
        format,
      };
    }
    return item;
  });
}

function coerceMonetization(raw: unknown): unknown {
  if (typeof raw === "string" && raw.trim()) {
    return { youtube: raw, tiktok: raw, facebook: raw, bilibili: raw };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const m = raw as Record<string, unknown>;
  return {
    youtube: asString(m["youtube"] ?? m["yt"]),
    tiktok: asString(m["tiktok"] ?? m["tt"]),
    facebook: asString(m["facebook"] ?? m["fb"]),
    bilibili: asString(m["bilibili"] ?? m["bili"]),
  };
}

export function coerceCloneShape(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const o = { ...(input as Record<string, unknown>) };
  if (o["contentPillars"] != null) o["contentPillars"] = coercePillars(o["contentPillars"]);
  if (o["firstVideos"] != null) o["firstVideos"] = coerceVideos(o["firstVideos"]);
  if (o["monetization"] != null) o["monetization"] = coerceMonetization(o["monetization"]);
  if (o["differentiation"] != null && typeof o["differentiation"] === "string") {
    o["differentiation"] = [o["differentiation"]];
  }
  return o;
}

export function prepareLlmJson(parsed: unknown): unknown {
  return coerceCloneShape(applyTopAliases(camelizeKeys(unwrapLlmObject(parsed))));
}

export function parseLlmJson<T extends z.ZodType>(schema: T, parsed: unknown): z.infer<T> {
  const prepared = prepareLlmJson(parsed);
  const first = schema.safeParse(prepared);
  if (first.success) return first.data as z.infer<T>;
  const retry = schema.safeParse(parsed);
  if (retry.success) return retry.data as z.infer<T>;
  throw first.error;
}

export function schemaHint(schema: z.ZodType): string {
  try {
    const json = z.toJSONSchema(schema);
    const text = JSON.stringify(json);
    return `\nJSON keys (camelCase, exact names):\n${text.slice(0, 5000)}`;
  } catch {
    return "";
  }
}
