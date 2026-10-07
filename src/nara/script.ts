import { z } from "zod";
import { AnthropicLLM } from "../providers/llm/anthropic.js";
import { AtlasLLM } from "../providers/llm/atlas.js";
import { CloudflareLLM } from "../providers/llm/cloudflare.js";
import { GeminiLLM } from "../providers/llm/gemini.js";
import { GrokLLM } from "../providers/llm/grok.js";
import { OpenAILLM } from "../providers/llm/openai.js";
import type { LLMProvider } from "../schema/providers.js";
import { NARA_TONES, targetWordCount } from "./catalog.js";
import type { NaraJobConfig, NaraScriptDoc } from "./types.js";

const ScriptSchema = z.object({
  title: z.string().describe("Título corto del audio"),
  script: z.string().describe("Guion hablado, listo para TTS, sin acotaciones ni bullets"),
});

function pickLlm(): LLMProvider | null {
  if (process.env["ATLASCLOUD_API_KEY"]) return new AtlasLLM();
  if (process.env["GOOGLE_API_KEY"]) return new GeminiLLM();
  if (process.env["ANTHROPIC_API_KEY"]) return new AnthropicLLM();
  if (process.env["OPENAI_API_KEY"]) return new OpenAILLM();
  if (process.env["XAI_API_KEY"]) return new GrokLLM();
  if (process.env["CLOUDFLARE_API_TOKEN"] && process.env["CLOUDFLARE_ACCOUNT_ID"]) {
    return new CloudflareLLM();
  }
  return null;
}

function toneLabel(id: string): string {
  return NARA_TONES.find((t) => t.id === id)?.label ?? id;
}

function langName(id: string): string {
  if (id.startsWith("en")) return "English";
  if (id.startsWith("pt")) return "Portuguese";
  if (id.startsWith("fr")) return "French";
  return "Spanish";
}

export function fallbackScript(config: NaraJobConfig): NaraScriptDoc {
  const words = targetWordCount(config.durationSec);
  const idea = config.idea.trim();
  const script =
    config.language.startsWith("en")
      ? `${idea}. That's the idea, said out loud, without filler, so you can copy this script and hear it as speech.`
      : `${idea}. Esa es la idea, dicha en voz alta, sin relleno, para que copies este guion y lo oigas como locución.`;
  return {
    title: idea.slice(0, 72) || "Nara",
    script,
    language: config.language,
    tone: config.tone,
    idea,
    targetWords: words,
  };
}

export async function draftNaraScript(config: NaraJobConfig): Promise<NaraScriptDoc> {
  const words = targetWordCount(config.durationSec);
  const fallback = fallbackScript(config);
  const llm = pickLlm();
  if (!llm) return fallback;

  const result = await llm.generate({
    systemPrompt: `You write spoken scripts for text-to-speech. Output only the spoken words.
No stage directions, no timestamps, no markdown, no bullet lists.
Language: ${langName(config.language)}. Tone: ${toneLabel(config.tone)} (${config.tone}).
Aim for about ${words} words so the read lasts ~${config.durationSec} seconds at 150 wpm.
The script must be the same text the TTS will speak, ready to copy-paste.`,
    userMessage: `Idea:\n${config.idea.trim()}${
      config.instructions?.trim() ? `\n\nExtra direction:\n${config.instructions.trim()}` : ""
    }`,
    schema: ScriptSchema,
  });

  const script = String(result.data.script ?? "").trim();
  const title = String(result.data.title ?? "").trim() || fallback.title;
  if (script.length < 20) return { ...fallback, title };
  return {
    title,
    script,
    language: config.language,
    tone: config.tone,
    idea: config.idea,
    targetWords: words,
  };
}
