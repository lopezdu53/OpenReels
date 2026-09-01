import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { charsToWords, GrokTTS } from "./grok.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function wavBuffer(): Buffer {
  const header = Buffer.alloc(12);
  header.write("RIFF", 0);
  header.write("WAVE", 8);
  return header;
}

describe("charsToWords", () => {
  it("groups characters into words using spaces", () => {
    const chars = ["H", "o", "l", "a", " ", "m", "u", "n", "d", "o"];
    const times = chars.map((_, i) => [i * 0.1, i * 0.1 + 0.1]);
    expect(charsToWords(chars, times)).toEqual([
      { word: "Hola", start: 0, end: 0.4 },
      { word: "mundo", start: 0.5, end: 1.0 },
    ]);
  });

  it("keeps punctuation attached to the preceding word", () => {
    const chars = ["H", "i", "!"];
    const times = [
      [0, 0.1],
      [0.1, 0.2],
      [0.2, 0.3],
    ];
    expect(charsToWords(chars, times)).toEqual([{ word: "Hi!", start: 0, end: 0.3 }]);
  });

  it("skips empty input", () => {
    expect(charsToWords([], [])).toEqual([]);
  });
});

describe("GrokTTS", () => {
  const origKey = process.env["XAI_API_KEY"];

  beforeEach(() => {
    process.env["XAI_API_KEY"] = "test-xai-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (origKey !== undefined) process.env["XAI_API_KEY"] = origKey;
    else delete process.env["XAI_API_KEY"];
  });

  it("throws when XAI_API_KEY is not set", () => {
    delete process.env["XAI_API_KEY"];
    expect(() => new GrokTTS()).toThrow("XAI_API_KEY environment variable is required");
  });

  it("sends language auto, timestamps, and wav format", async () => {
    const audio = wavBuffer().toString("base64");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "application/json" },
      json: async () => ({
        audio,
        audio_timestamps: {
          graph_chars: ["H", "i", " ", "t", "h", "e", "r", "e"],
          graph_times: [
            [0, 0.1],
            [0.1, 0.2],
            [0.2, 0.25],
            [0.25, 0.3],
            [0.3, 0.35],
            [0.35, 0.4],
            [0.4, 0.45],
            [0.45, 0.5],
          ],
        },
      }),
    });

    const tts = new GrokTTS(undefined, "ara");
    const result = await tts.generate("Hi there");

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.x.ai/v1/tts",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"language":"auto"'),
      }),
    );
    const body = JSON.parse((mockFetch.mock.calls[0] as [string, { body: string }])[1].body) as {
      with_timestamps: boolean;
      language: string;
      voice_id: string;
      text_normalization: boolean;
    };
    expect(body.language).toBe("auto");
    expect(body.with_timestamps).toBe(true);
    expect(body.voice_id).toBe("ara");
    expect(body.text_normalization).toBe(true);
    expect(result.words.map((w) => w.word)).toEqual(["Hi", "there"]);
    expect(result.audio.length).toBeGreaterThan(0);
  });

  it("does not hardcode English", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      headers: { get: () => "audio/wav" },
      arrayBuffer: async () => wavBuffer().buffer,
    });
    await new GrokTTS().generate("En una ciudad de neón");
    const body = JSON.parse((mockFetch.mock.calls[0] as [string, { body: string }])[1].body) as {
      language: string;
    };
    expect(body.language).not.toBe("en");
    expect(body.language).toBe("auto");
  });

  it("wraps auth errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => "invalid key",
    });
    await expect(new GrokTTS().generate("Hello")).rejects.toThrow("authentication failed");
  });

  it("rejects scripts over 15000 chars", async () => {
    await expect(new GrokTTS().generate("x".repeat(15_001))).rejects.toThrow("limit exceeded");
  });
});
