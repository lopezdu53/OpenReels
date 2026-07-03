import { GoogleGenAI } from "@google/genai";
import type { ImageProvider } from "../../schema/providers.js";

// VIVI is Gemini-compatible. The base domain is replaced while the SDK
// appends the /v1beta path automatically via httpOptions.baseUrl.
const VIVI_BASE_URL = "https://api.viviai.cc";
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

export class ViviImage implements ImageProvider {
  private client: GoogleGenAI;
  private model: string;

  constructor(model: string = "gemini-3.1-flash-image-preview", apiKey?: string) {
    const key = apiKey ?? process.env["VIVI_IMAGE_API_KEY"];
    if (!key) throw new Error("VIVI_IMAGE_API_KEY environment variable is required");
    this.client = new GoogleGenAI({ apiKey: key, httpOptions: { baseUrl: VIVI_BASE_URL } });
    this.model = model;
  }

  async generate(prompt: string, style?: string, referenceImage?: Buffer, aspectRatio?: string): Promise<Buffer> {
    const isLandscape = aspectRatio === "16:9";
    const orientationHint = isLandscape
      ? "WIDE HORIZONTAL LANDSCAPE image ONLY. 16:9 widescreen aspect ratio, wider than tall. CRITICAL: Do NOT generate portrait or vertical orientation. Compose as a cinematic widescreen scene filling the full horizontal frame. 1920x1080 pixels"
      : "Vertical 9:16 aspect ratio, 1080x1920 pixels";
    const continuityHint = referenceImage
      ? " Keep the same characters, setting, color palette and visual style as the reference image so this scene reads as a continuation of the same story."
      : "";
    const fullPrompt = isLandscape
      ? `${orientationHint}. ${prompt}.${continuityHint}${style ? ` Style: ${style}.` : ""} No text, no watermarks.`
      : style
        ? `${prompt}. Style: ${style}.${continuityHint} ${orientationHint}. No text, no watermarks.`
        : `${prompt}.${continuityHint} ${orientationHint}. No text, no watermarks.`;

    const contents = referenceImage
      ? [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: "image/png", data: referenceImage.toString("base64") } },
              { text: fullPrompt },
            ],
          },
        ]
      : fullPrompt;

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const response = await this.client.models.generateContent({
          model: this.model,
          contents,
          config: {
            responseModalities: ["image", "text"],
          },
        });

        const parts = response.candidates?.[0]?.content?.parts;
        if (!parts) throw new Error("VIVI returned no content");

        for (const part of parts) {
          if (part.inlineData?.data) {
            return Buffer.from(part.inlineData.data, "base64");
          }
        }

        throw new Error("VIVI returned no image data");
      } catch (err) {
        lastError = err;
        if (!isRetryable(err) || attempt === MAX_RETRIES - 1) break;
        const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[image/vivi] Attempt ${attempt + 1} failed (${err}), retrying in ${delayMs / 1000}s...`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw lastError;
  }
}
