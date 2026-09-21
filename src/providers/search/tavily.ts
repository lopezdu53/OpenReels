import { tavilySearch } from "@tavily/ai-sdk";

/**
 * Create Tavily search tools for the AI SDK two-pass web search pattern.
 * Falls back to TAVILY_API_KEY env var when no apiKey is provided.
 */
export function createTavilySearchTools(apiKey?: string): Record<string, unknown> {
  return {
    tavily_search: tavilySearch({
      ...(apiKey ? { apiKey } : {}),
      maxResults: 5,
    }),
  };
}

/** Direct search for LLMs that 400 on tool calling (Atlas / DeepSeek). */
export async function fetchTavilyNotes(topic: string, apiKey?: string): Promise<string> {
  const key = apiKey || process.env["TAVILY_API_KEY"];
  if (!key) return "";
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query: topic,
        max_results: 5,
        search_depth: "basic",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`[tavily] search HTTP ${res.status}`);
      return "";
    }
    const json = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const rows = (json.results ?? []).filter((r) => r.content || r.title);
    if (!rows.length) return "";
    return rows
      .slice(0, 5)
      .map((r, i) => `${i + 1}. ${r.title ?? ""} — ${r.url ?? ""}\n${(r.content ?? "").slice(0, 400)}`)
      .join("\n\n");
  } catch {
    return "";
  }
}
