import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import type { LLMProvider, LLMUsage } from "../schema/providers.js";

const SYSTEM_PROMPT_PATH = path.join(process.cwd(), "prompts", "researcher.md");

const ResearchResult = z.object({
  summary: z.string(),
  key_facts: z.array(z.string()),
  mood: z.string(),
  sources: z.array(z.string()),
});
export type ResearchResult = z.infer<typeof ResearchResult>;

export interface ResearchOutput {
  data: ResearchResult;
  usage: LLMUsage;
}

const PARAMETRIC_SUFFIX =
  "\n\nYou do not have access to web search. Use your training knowledge to provide the best possible research.";

function loadSystemPrompt(): string {
  try {
    return fs.readFileSync(SYSTEM_PROMPT_PATH, "utf-8");
  } catch {
    return "You are a research assistant. Given a topic, search the web for current information and produce a structured research summary with key facts, mood/tone, and sources.";
  }
}

export async function research(llm: LLMProvider, topic: string): Promise<ResearchOutput> {
  const systemPrompt = loadSystemPrompt();
  const userMessage = `Research this topic for a short-form video script: ${topic}`;

  try {
    const result = await llm.generate({
      systemPrompt,
      userMessage,
      schema: ResearchResult,
      enableWebSearch: true,
    });
    return { data: result.data, usage: result.usage };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[research] Web search failed, retrying with parametric knowledge: ${msg}`);
    const result = await llm.generate({
      systemPrompt: systemPrompt + PARAMETRIC_SUFFIX,
      userMessage,
      schema: ResearchResult,
      enableWebSearch: false,
    });
    return { data: result.data, usage: result.usage };
  }
}
