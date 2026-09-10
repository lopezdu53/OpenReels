import { describe, expect, it, vi } from "vitest";

vi.mock("@tavily/ai-sdk", () => ({
  tavilySearch: vi.fn((opts: Record<string, unknown>) => ({ type: "tavily", ...opts })),
}));

import { createTavilySearchTools, fetchTavilyNotes } from "./tavily.js";

describe("createTavilySearchTools", () => {
  it("returns tools with explicit apiKey", () => {
    const tools = createTavilySearchTools("test-key");
    expect(tools).toHaveProperty("tavily_search");
    expect(tools["tavily_search"]).toMatchObject({ apiKey: "test-key", maxResults: 5 });
  });

  it("returns tools without apiKey (env fallback)", () => {
    const tools = createTavilySearchTools();
    expect(tools).toHaveProperty("tavily_search");
    expect(tools["tavily_search"]).toMatchObject({ maxResults: 5 });
    expect(tools["tavily_search"]).not.toHaveProperty("apiKey");
  });
});

describe("fetchTavilyNotes", () => {
  it("returns empty without a key", async () => {
    const orig = process.env["TAVILY_API_KEY"];
    delete process.env["TAVILY_API_KEY"];
    expect(await fetchTavilyNotes("neobancos")).toBe("");
    if (orig !== undefined) process.env["TAVILY_API_KEY"] = orig;
  });

  it("formats hits from the Tavily REST API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          results: [{ title: "Nubank", url: "https://nubank.com", content: "80 millones de usuarios" }],
        }),
      }),
    );
    const notes = await fetchTavilyNotes("neobancos", "tv-test");
    expect(notes).toContain("Nubank");
    expect(notes).toContain("80 millones");
    vi.unstubAllGlobals();
  });
});
