import { GoogleGenAI } from "@google/genai";
import type { ImageProvider } from "../../schema/providers.js";

const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

function isRetryable(err: unknown): boolean {
  const msg = String(err);
  return (
    msg.includes("503") ||
    msg.includes("UNAVAILABLE") ||
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("fetch failed") ||
    msg.includes("ECONNRESET")
  );
}

export class GeminiImage implements ImageProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(model: string = "gemini-3.1-flash-image-preview", apiKey?: string) {
    const key = apiKey ?? process.env["GOOGLE_API_KEY"];
    if (!key) throw new Error("GOOGLE_API_KEY environment variable is required");
    this.client = new GoogleGenAI({ apiKey: key });
    this.model = model;
  }

  async generate(prompt: string, style?: string): Promise<Buffer> {
    const fullPrompt = style
      ? `${prompt}. Style: ${style}. Vertical 9:16 aspect ratio, 1080x1920 pixels. No text, no watermarks.`
      : `${prompt}. Vertical 9:16 aspect ratio, 1080x1920 pixels. No text, no watermarks.`;

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents: fullPrompt,
          config: {
            responseModalities: ["image", "text"],
          },
        });

        const parts = response.candidates?.[0]?.content?.parts;
        if (!parts) throw new Error("Gemini returned no content");

        for (const part of parts) {
          if (part.inlineData?.data) {
            return Buffer.from(part.inlineData.data, "base64");
          }
        }

        throw new Error("Gemini returned no image data");
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === MAX_RETRIES - 1) break;
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[image/gemini] Attempt ${attempt + 1} failed (${err}), retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw lastError;
  }
}
