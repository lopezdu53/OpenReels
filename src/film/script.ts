import { z } from "zod";
import { AliCloudLLM } from "../providers/llm/alicloud.js";
import { AnthropicLLM } from "../providers/llm/anthropic.js";
import { GeminiLLM } from "../providers/llm/gemini.js";
import { GrokLLM } from "../providers/llm/grok.js";
import { OpenAILLM } from "../providers/llm/openai.js";
import { OpenRouterLLM } from "../providers/llm/openrouter.js";
import { ViviLLM } from "../providers/llm/vivi.js";
import type { LLMProvider } from "../schema/providers.js";
import { filmWordsTarget, isFilmTestMinutes, normalizeFilmMinutes } from "../config/film-duration.js";
import { MAX_FILM_CHARACTERS } from "../library/identity.js";

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
): string {
  const members = cast.filter((c) => c.name?.trim()).slice(0, MAX_FILM_CHARACTERS);
  if (!members.length) return "";
  const lines = members.map((c, i) => {
    const bits = [c.name.trim(), c.kind?.trim(), c.species?.trim()].filter(Boolean).join(" — ");
    return `${i + 1}. ${bits}`;
  });
  const n = members.length;
  return `Reparto bloqueado (${n} personaje${n === 1 ? "" : "s"}; usa estos nombres en la locución, no inventes protagonistas extra):\n${lines.join("\n")}`;
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
}): Promise<FilmScript> {
  const minutes = normalizeFilmMinutes(opts.durationMinutes) ?? 8;
  const words = filmWordsTarget(minutes);
  const refs = (opts.youtubeUrls ?? []).slice(0, 10);
  const cast = buildCastBrief(opts.characters ?? []);
  const llm = pickFilmLlm(opts.llm, opts.llmModel);
  const result = await llm.generate({
    systemPrompt:
      "Eres un guionista de YouTube en español LATAM para videos HORIZONTALES 16:9 (no Shorts). Escribes locución hablable en voz alta, un dato por frase, gancho en 8s. JSON único con title, hook, script.",
    userMessage: [
      `Idea: ${opts.idea.trim()}`,
      isFilmTestMinutes(minutes)
        ? `Duración objetivo: 30 segundos (~${words} palabras de locución). Prueba rápida, ${
            (opts.characters?.length ?? 0) > 1 ? "solo el elenco bloqueado" : "un solo personaje"
          }, sin letreros.`
        : `Duración objetivo: ${minutes} minutos (~${words} palabras de locución).`,
      cast,
      refs.length ? `Referencias de formato (no copies identidad):\n${refs.map((u) => `- ${u}`).join("\n")}` : "",
      "title = título propio de YouTube, ≤ 70 caracteres.",
      "hook = primera frase hablada, ≤ 160 caracteres.",
      "script = locución completa, párrafos cortos, cierre con CTA de suscripción.",
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
