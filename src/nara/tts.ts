import type { TTSProvider } from "../schema/providers.js";
import { AtlasTTS } from "../providers/tts/atlas.js";
import { CloudflareTTS } from "../providers/tts/cloudflare.js";
import { ElevenLabsTTS } from "../providers/tts/elevenlabs.js";
import { GeminiTTS } from "../providers/tts/gemini.js";
import { GrokTTS } from "../providers/tts/grok.js";
import { InworldTTS } from "../providers/tts/inworld.js";
import { KokoroTTS } from "../providers/tts/kokoro.js";
import { OpenAITTS } from "../providers/tts/openai.js";
import { naraProvider } from "./catalog.js";
import type { NaraJobConfig } from "./types.js";

function clamp(n: number | undefined, min: number, max: number, fallback: number): number {
  if (n == null || !Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function createNaraTts(config: NaraJobConfig): TTSProvider {
  const spec = naraProvider(config.ttsProvider);
  const voice = (config.voice ?? spec.defaultVoice ?? "").trim();
  const model = config.ttsModel ?? spec.defaultModel;
  const speed = clamp(config.speed, spec.speedMin ?? 0.5, spec.speedMax ?? 2, spec.defaultSpeed ?? 1);
  const language = config.language || "es";

  switch (config.ttsProvider) {
    case "kokoro":
      return new KokoroTTS(voice || "ef_dora", speed);
    case "cloudflare-tts":
      return new CloudflareTTS(model, voice || "aquila");
    case "atlas-tts":
      return new AtlasTTS(voice || "eve", undefined, speed, model, language);
    case "grok-tts":
      return new GrokTTS(model, voice || "eve", undefined, speed, language);
    case "gemini-tts":
      return new GeminiTTS(model, undefined, voice || "Kore");
    case "openai-tts":
      return new OpenAITTS(model, undefined, voice || "alloy", speed, config.instructions);
    case "inworld":
      return new InworldTTS(voice || "Pedro", model);
    default:
      return new ElevenLabsTTS(voice || undefined, undefined, {
        stability: config.stability,
        style: config.style,
        speed,
      });
  }
}
