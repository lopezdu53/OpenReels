import type { ImageProvider } from "../../schema/providers.js";

/**
 * Tries the primary image provider first; if it fails with a transient error,
 * immediately falls back to the secondary provider instead of waiting through
 * long retries. Each provider handles its own quick retries internally.
 */
export class FallbackImageProvider implements ImageProvider {
  constructor(
    private primary: ImageProvider,
    private secondary: ImageProvider,
    private primaryName: string = "primary",
    private secondaryName: string = "secondary",
  ) {}

  async generate(prompt: string, style?: string): Promise<Buffer> {
    try {
      return await this.primary.generate(prompt, style);
    } catch (err) {
      console.warn(`[image/fallback] ${this.primaryName} failed (${err}), switching to ${this.secondaryName}`);
      return await this.secondary.generate(prompt, style);
    }
  }
}
