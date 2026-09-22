import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { createStudioImage } from "../studio/visual-provider.js";
import { lookPrompt, STICKMAN_STYLE_LOCK } from "./catalog.js";
import { llmUsageFromAtlas, type StickmanLlmUsage } from "./cost.js";
import { jobDir, readMeta, readScript, stillFiles, writeMeta } from "./store.js";
import type { StickmanJobConfig, StickmanYoutubePack } from "./types.js";

export const YOUTUBE_THUMB_NAME = "youtube-thumb.png";

export function fallbackYoutubePack(topic: string, language: string): StickmanYoutubePack {
  const es = !language.startsWith("en");
  const title = es
    ? `${topic.slice(0, 70)} | Lo que nadie te dijo`
    : `${topic.slice(0, 70)} | Nobody told you this`;
  const description = es
    ? `${topic}. Palitos 2D, un solo plano continuo. Mira hasta el final.`
    : `${topic}. Stick-figure 2D, one continuous shot. Watch to the end.`;
  const hashtags = es
    ? ["#stickman", "#shorts", "#viral", "#youtube", "#animacion"]
    : ["#stickman", "#shorts", "#viral", "#youtube", "#animation"];
  const seo = es
    ? `stickman, palitos, ${topic}, video viral, explicacion, youtube`
    : `stickman, stick figures, ${topic}, viral video, explainer, youtube`;
  return { title: title.slice(0, 100), description, hashtags, seo };
}

export function youtubePackPrompt(config: StickmanJobConfig, pack: StickmanYoutubePack): string {
  const lang = config.language.startsWith("en") ? "English" : "Spanish (LATAM)";
  return `You write viral YouTube packaging for a 16:9 stickman video.
Language: ${lang}. Topic: ${config.topic}. Duration: ${config.durationSec}s. Look: ${config.look}.
Return ONLY JSON with keys: title, description, hashtags (array of 5-10 strings starting with #), seo (comma-separated keywords).
Title: max 70 chars, curiosity + payoff, no clickbait lies, no ALL CAPS spam.
Description: 2-4 short paragraphs, first line is a hook, include a call to watch, natural keywords.
Hashtags: mix broad + niche. seo: 8-15 search terms.
Base object: ${JSON.stringify(pack)}`;
}

export function parseYoutubePack(text: string, fallback: StickmanYoutubePack): StickmanYoutubePack {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return fallback;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<StickmanYoutubePack>;
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .map((tag) => String(tag))
          .filter(Boolean)
          .slice(0, 12)
      : fallback.hashtags;
    return {
      title: String(parsed.title ?? fallback.title).slice(0, 100),
      description: String(parsed.description ?? fallback.description).slice(0, 5000),
      hashtags: hashtags.map((tag) => (tag.startsWith("#") ? tag : `#${tag.replace(/\s+/g, "")}`)),
      seo: String(parsed.seo ?? fallback.seo).slice(0, 500),
    };
  } catch {
    return fallback;
  }
}

export function youtubeThumbPrompt(config: StickmanJobConfig, title: string): string {
  return [
    "YouTube thumbnail 16:9 landscape, high contrast, click-stopping, fill the frame edge to edge.",
    `Huge readable title text: "${title.slice(0, 48)}". Big bold letters, high contrast, not tiny.`,
    `2D stickman look: ${lookPrompt(config.look)}.`,
    "Emotional stick-figure reaction, one clear focal point, saturated accent color.",
    "No photoreal faces. No collage. No watermarks. No logos. No letterbox bars.",
    STICKMAN_STYLE_LOCK,
  ].join(" ");
}

function extractCoverFrame(video: string, dest: string): boolean {
  try {
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        "1.2",
        "-i",
        video,
        "-frames:v",
        "1",
        dest,
      ],
      { stdio: "pipe" },
    );
    return fs.existsSync(dest) && fs.statSync(dest).size > 800;
  } catch {
    return false;
  }
}

async function draftPackWithAtlas(
  apiKey: string,
  config: StickmanJobConfig,
  fallback: StickmanYoutubePack,
): Promise<{ pack: StickmanYoutubePack; usage?: StickmanLlmUsage }> {
  const model = config.llmModel || "google/gemini-2.5-flash";
  const res = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "You write viral YouTube titles. JSON only.",
        },
        { role: "user", content: youtubePackPrompt(config, fallback) },
      ],
      temperature: 0.8,
    }),
  });
  if (!res.ok) throw new Error(`Atlas SEO ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  return { pack: parseYoutubePack(content, fallback), usage: llmUsageFromAtlas(data.usage) };
}

async function writeYoutubeThumb(
  id: string,
  apiKey: string,
  config: StickmanJobConfig,
  title: string,
  dest: string,
  log: (line: string) => void,
): Promise<void> {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 800) return;
  try {
    const image = createStudioImage({
      visualProvider: "gflow",
      gflowModel: config.gflowImageModel || "nano-pro",
      atlasKey: apiKey,
    });
    const still = stillFiles(id)[0];
    const ref = still ? fs.readFileSync(path.join(jobDir(id), "stills", still)) : undefined;
    const buf = await image.generate(youtubeThumbPrompt(config, title), undefined, ref, "16:9");
    if (buf.length > 800) {
      fs.writeFileSync(dest, buf);
      log(`portada YouTube → ${YOUTUBE_THUMB_NAME}`);
    }
  } catch (err) {
    log(`gflow portada falló (${err}); intento captura del video`);
    const video = path.join(jobDir(id), "final.mp4");
    if (fs.existsSync(video)) extractCoverFrame(video, dest);
  }
}

export async function runYoutubePack(
  id: string,
  apiKey: string,
  log: (line: string) => void,
): Promise<StickmanLlmUsage | undefined> {
  const meta = readMeta(id);
  if (!meta || meta.config.aspect !== "16:9") return undefined;
  const fallback = fallbackYoutubePack(meta.config.topic, meta.config.language);
  let pack = meta.youtubePack ?? fallback;
  let usage: StickmanLlmUsage | undefined;
  try {
    const drafted = await draftPackWithAtlas(apiKey, meta.config, fallback);
    pack = drafted.pack;
    usage = drafted.usage;
    log(`YouTube pack: ${pack.title}`);
  } catch (err) {
    log(`YouTube SEO fallback (${err})`);
    pack = fallback;
  }

  const dest = path.join(jobDir(id), YOUTUBE_THUMB_NAME);
  await writeYoutubeThumb(id, apiKey, meta.config, pack.title, dest, log);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 800) {
    pack.thumbnailRel = YOUTUBE_THUMB_NAME;
  }
  const script = readScript(id);
  const next = readMeta(id);
  if (!next) return usage;
  next.youtubePack = pack;
  next.previewRel =
    pack.thumbnailRel ?? next.previewRel ?? (script?.beats[0]?.stillPath || undefined);
  writeMeta(next);
  return usage;
}
