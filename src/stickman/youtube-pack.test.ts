import { describe, expect, it } from "vitest";
import type { StickmanJobConfig } from "./types.js";
import {
  fallbackYoutubePack,
  parseYoutubePack,
  youtubePackPrompt,
  youtubeThumbPrompt,
} from "./youtube-pack.js";

const config: StickmanJobConfig = {
  topic: "el wifi de la oficina",
  durationSec: 60,
  aspect: "16:9",
  language: "es",
  look: "classic",
  castMode: "solo",
  arc: "joke_punchline",
  voiceId: "eve",
  voiceSpeed: 1,
  captions: false,
  animate: true,
  imageModel: "x",
  videoModel: "y",
  atlasTtsModel: "xai/tts-v1",
};

describe("stickman youtube pack", () => {
  it("parses viral JSON and keeps a fallback", () => {
    const fallback = fallbackYoutubePack(config.topic, "es");
    expect(fallback.title.toLowerCase()).toContain("wifi");
    const parsed = parseYoutubePack(
      '```json\n{"title":"El wifi te miente","description":"Mira.","hashtags":["viral","stickman"],"seo":"wifi, oficina"}\n```',
      fallback,
    );
    expect(parsed.title).toBe("El wifi te miente");
    expect(parsed.hashtags).toContain("#viral");
    expect(parsed.hashtags).toContain("#stickman");
    expect(parseYoutubePack("not json", fallback).title).toBe(fallback.title);
  });

  it("asks gflow for a 16:9 thumbnail with the title on it", () => {
    const prompt = youtubeThumbPrompt(config, "El wifi te miente");
    expect(prompt).toContain("16:9");
    expect(prompt).toContain("El wifi te miente");
    expect(youtubePackPrompt(config, fallbackYoutubePack(config.topic, "es"))).toContain(
      "hashtags",
    );
  });
});
