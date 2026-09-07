import { z } from "zod";
import { AliCloudLLM } from "../providers/llm/alicloud.js";
import { AnthropicLLM } from "../providers/llm/anthropic.js";
import { GeminiLLM } from "../providers/llm/gemini.js";
import { GrokLLM } from "../providers/llm/grok.js";
import { OpenAILLM } from "../providers/llm/openai.js";
import { OpenRouterLLM } from "../providers/llm/openrouter.js";
import { ViviLLM } from "../providers/llm/vivi.js";
import type { LLMProvider } from "../schema/providers.js";
import { filmDurationLabel, filmWordsTarget, isFilmQuickTest, normalizeFilmMinutes } from "../config/film-duration.js";
import { MAX_FILM_CHARACTERS, MAX_FILM_LOCATIONS, MAX_FILM_OBJECTS, normalizeCastMode, type CastMode } from "../library/identity.js";

export const filmScriptSchema = z.object({
  title: z.string(),
  hook: z.string(),
  script: z.string(),
});

export type FilmScript = z.infer<typeof filmScriptSchema>;

const YT_URL =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+|youtube\.com\/shorts\/[\w-]+)/gi;

export function parseYoutubeUrls(text: string): string[] {
  const found = text.match(YT_URL) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const id = raw.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/)?.[1] ?? raw;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(raw);
  }
  return out.slice(0, 10);
}

export function titleFromScript(script: string, fallback = "Film YouTube"): string {
  const line = script
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s.length > 0 && !s.startsWith("#"));
  const raw = (line ?? fallback).replace(/^["'«]+|["'»]+$/g, "");
  return raw.slice(0, 120) || fallback;
}

export function buildFilmDirection(script: string, youtubeUrls: string[] = []): string {
  const parts = [
    "## Guion (locución — honrar estas líneas; no reescribir el texto hablado)",
    script.trim(),
  ];
  if (youtubeUrls.length) {
    parts.push(
      "",
      "## Referencias YouTube (clona FORMATO y ritmo, nunca identidad, thumbnails ni títulos literales)",
      ...youtubeUrls.map((u) => `- ${u}`),
    );
  }
  parts.push(
    "",
    "## Formato",
    "Video horizontal 16:9 para YouTube (1920x1080). No es un Short vertical.",
  );
  return parts.join("\n");
}

export function buildCastBrief(
  cast: Array<{ name: string; species?: string; kind?: string }>,
  mode: CastMode = "scene",
): string {
  const members = cast.filter((c) => c.name?.trim()).slice(0, MAX_FILM_CHARACTERS);
  if (!members.length) return "";
  const lines = members.map((c, i) => {
    const bits = [c.name.trim(), c.kind?.trim(), c.species?.trim()].filter(Boolean).join(" — ");
    return `${i + 1}. ${bits}`;
  });
  const n = members.length;
  if (normalizeCastMode(mode) === "hero") {
    const hero = members[0]!.name.trim();
    return `Héroe FOLLOW-CAM: ${hero} (eje óptico de un plano continuo; nómbralo con naturalidad). ${n > 1 ? "Los demás solo cuando la locución los necesita. " : ""}La cámara lo sigue; el mundo se pega a su cuerpo. Reparto (${n}):\n${lines.join("\n")}`;
  }
  return `Reparto bloqueado (${n} personaje${n === 1 ? "" : "s"}; usa estos nombres en la locución, no inventes protagonistas extra):\n${lines.join("\n")}`;
}

export function buildLocationBrief(
  places: Array<{ name: string; place?: string }>,
): string {
  const members = places.filter((l) => l.name?.trim()).slice(0, MAX_FILM_LOCATIONS);
  if (!members.length) return "";
  const lines = members.map((l, i) => {
    const bits = [l.name.trim(), l.place?.trim()].filter(Boolean).join(" — ");
    return `${i + 1}. ${bits}`;
  });
  const n = members.length;
  return `Locaciones bloqueadas (${n}; nombra UNA por escena, nunca combines dos lugares en la misma frase visual):\n${lines.join("\n")}`;
}

export function buildObjectBrief(
  objects: Array<{ name: string; prompt?: string }>,
): string {
  const members = objects.filter((o) => o.name?.trim()).slice(0, MAX_FILM_OBJECTS);
  if (!members.length) return "";
  const lines = members.map((o, i) => {
    const bits = [o.name.trim(), o.prompt?.trim()].filter(Boolean).join(" — ");
    return `${i + 1}. ${bits}`;
  });
  const n = members.length;
  return `Objetos / props bloqueados (${n}; pueden aparecer varios juntos si la escena los necesita; no inventes props fuera de esta lista):\n${lines.join("\n")}`;
}

function clipText(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

export function extractScoreCastNames(
  score?: { scenes?: Array<{ visual_prompt?: string }> } | null,
): string[] {
  const names = new Set<string>();
  for (const scene of score?.scenes ?? []) {
    for (const m of scene.visual_prompt?.matchAll(/\bName:\s*([^.|/]+)/gi) ?? []) {
      const name = m[1]?.trim();
      if (name && name.length >= 2 && name.length <= 40) names.add(name);
    }
  }
  return [...names].slice(0, MAX_FILM_CHARACTERS);
}

export function buildSequelBrief(opts: {
  title: string;
  scenes?: Array<{ script_line?: string; location?: string }>;
  characters?: string[];
}): string {
  const lines = (opts.scenes ?? []).map((s) => s.script_line?.trim() ?? "").filter(Boolean);
  if (!opts.title.trim() && !lines.length) return "";
  const opening = clipText(lines.slice(0, 5).join(" "), 700);
  const ending = clipText(lines.slice(-8).join(" "), 900);
  const locations = [...new Set((opts.scenes ?? []).map((s) => s.location?.trim()).filter(Boolean) as string[])].slice(0, 8);
  const parts = [
    `CONTINUACIÓN del episodio anterior: «${opts.title.trim()}».`,
    opening ? `Qué ya pasó: ${opening}` : "",
    ending ? `Cómo cerró (parte de aquí, no lo reescribas ni lo resumas como si fuera nuevo): ${ending}` : "",
    opts.characters?.length ? `Personajes ya establecidos: ${opts.characters.join(", ")}` : "",
    locations.length ? `Lugares ya establecidos: ${locations.join(", ")}` : "",
    "No reinicies. No re-presentes a nadie como si el público no los conociera. Avanza la trama, honra los hechos ya narrados, y cierra con gancho al siguiente capítulo.",
  ];
  return parts.filter(Boolean).join("\n");
}

export function pickFilmLlm(provider?: string, model?: string): LLMProvider {
  switch (provider) {
    case "openai":
      return new OpenAILLM(model);
    case "gemini":
      return new GeminiLLM(model);
    case "openrouter":
      return new OpenRouterLLM(model);
    case "vivi":
      return new ViviLLM(model);
    case "alicloud":
      return new AliCloudLLM(model);
    case "grok":
      return new GrokLLM(model);
    default:
      return new AnthropicLLM(model);
  }
}

export async function generateFilmScript(opts: {
  idea: string;
  durationMinutes: number;
  llm?: string;
  llmModel?: string;
  youtubeUrls?: string[];
  characters?: Array<{ name: string; species?: string; kind?: string }>;
  locations?: Array<{ name: string; place?: string }>;
  objects?: Array<{ name: string; prompt?: string }>;
  castMode?: string;
  previousStory?: string;
}): Promise<FilmScript> {
  const minutes = normalizeFilmMinutes(opts.durationMinutes) ?? 8;
  const words = filmWordsTarget(minutes);
  const refs = (opts.youtubeUrls ?? []).slice(0, 10);
  const cast = buildCastBrief(opts.characters ?? [], normalizeCastMode(opts.castMode));
  const places = buildLocationBrief(opts.locations ?? []);
  const props = buildObjectBrief(opts.objects ?? []);
  const sequel = opts.previousStory?.trim() ?? "";
  const llm = pickFilmLlm(opts.llm, opts.llmModel);
  const result = await llm.generate({
    systemPrompt:
      "Eres un guionista de YouTube en español LATAM para videos HORIZONTALES 16:9 (no Shorts). Escribes locución hablable en voz alta, un dato por frase, gancho en 8s. JSON único con title, hook, script. Si hay un episodio anterior, continúas esa historia: no la reinicias.",
    userMessage: [
      `Idea: ${opts.idea.trim()}`,
      isFilmQuickTest(minutes)
        ? `Duración objetivo: ${filmDurationLabel(minutes)} (~${words} palabras de locución). Prueba rápida, ${
            (opts.characters?.length ?? 0) > 1 ? "solo el elenco bloqueado" : "un solo personaje"
          }, sin letreros.`
        : `Duración objetivo: ${filmDurationLabel(minutes)} (~${words} palabras de locución). Sin tarjetas de texto en pantalla.`,
      cast,
      places,
      props,
      sequel,
      refs.length ? `Referencias de formato (no copies identidad):\n${refs.map((u) => `- ${u}`).join("\n")}` : "",
      "title = título propio de YouTube, ≤ 70 caracteres." + (sequel ? " Distinto al episodio anterior." : ""),
      "hook = primera frase hablada, ≤ 160 caracteres.",
      "script = locución completa, párrafos cortos, cierre con CTA de suscripción o gancho al siguiente capítulo.",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: filmScriptSchema,
  });
  const data = result.data;
  if (!data.script?.trim()) throw new Error("El LLM no devolvió un guion");
  if (!data.title?.trim()) data.title = titleFromScript(data.script, opts.idea.trim().slice(0, 80));
  if (!data.hook?.trim()) data.hook = data.script.trim().split(/[.!?]/)[0]?.trim() ?? data.title;
  return data;
}
