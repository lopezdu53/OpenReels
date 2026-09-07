import {
  DEFAULT_STICKMAN_IMAGE_MODEL,
  DEFAULT_STICKMAN_VIDEO_MODEL,
  STICKMAN_STYLE_LOCK,
  beatCountForDuration,
  lookPrompt,
  recommendArc,
} from "./catalog.js";
import type { StickmanBeat, StickmanCastMember, StickmanJobConfig, StickmanScript } from "./types.js";

function slug(topic: string): string {
  return (
    topic
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "stickman"
  );
}

function defaultCast(mode: StickmanJobConfig["castMode"]): StickmanCastMember[] {
  const hero: StickmanCastMember = {
    name: "Palo",
    role: "hero",
    head: "circle",
    accessory: "none",
    lineColor: "black",
  };
  if (mode !== "duo") return [hero];
  return [
    hero,
    {
      name: "Línea",
      role: "partner",
      head: "oval",
      accessory: "tiny hat",
      lineColor: "black",
    },
  ];
}

function beatTitle(i: number, n: number, arc: string): string {
  if (i === 0) return "HOOK";
  if (i === n - 1) return "PAYOFF";
  if (arc === "listicle") return `PUNTO ${i}`;
  if (arc === "vs_debate") return i % 2 === 1 ? "PALO" : "LÍNEA";
  return `BEAT ${i + 1}`;
}

function beatPose(i: number, n: number, mode: StickmanJobConfig["castMode"]): string {
  if (mode === "duo") {
    return i % 2 === 0
      ? "Palo points at a simple geometric prop while Línea leans in"
      : "Línea shrugs with both stick arms; Palo stands opposite";
  }
  if (i === 0) return "Palo steps into frame and points at the viewer";
  if (i === n - 1) return "Palo stands still, one arm raised in a tiny victory pose";
  return ["Palo walks left to right", "Palo holds a simple square prop", "Palo scratches the circle head"][i % 3]!;
}

function beatNarration(i: number, n: number, topic: string, language: string): string {
  if (language.startsWith("en")) {
    if (i === 0) return `${topic}. Drawn with two lines and a circle.`;
    if (i === n - 1) return `That's ${topic}. Stick figures remember.`;
    return `Next beat of ${topic}, still just lines.`;
  }
  if (i === 0) return `${topic}. Dos palitos y un círculo.`;
  if (i === n - 1) return `Eso es ${topic}. Los palitos no olvidan.`;
  return `Siguiente palito de ${topic}.`;
}

export function draftScriptTemplate(config: StickmanJobConfig, project: string): StickmanScript {
  const n = beatCountForDuration(config.durationSec);
  const dur = Math.max(2, Math.round(config.durationSec / n));
  const arc = config.arc || recommendArc(config.topic);
  const look = config.look || "classic";
  const beats: StickmanBeat[] = [];
  for (let i = 0; i < n; i++) {
    beats.push({
      id: i + 1,
      title: beatTitle(i, n, arc),
      pose: beatPose(i, n, config.castMode),
      scene: `empty ${look} ground line, one simple geometric prop about ${config.topic}`,
      narration: beatNarration(i, n, config.topic, config.language),
      durationSec: dur,
    });
  }

  return {
    project,
    topic: config.topic,
    language: config.language,
    aspect: config.aspect,
    style: "stickman",
    provider: "atlas_cloud",
    look,
    castMode: config.castMode,
    arc,
    bible: {
      look,
      cast: defaultCast(config.castMode),
      world: `flat ${look} backdrop, one horizon line, no furniture catalog, no photoreal room`,
    },
    voice: {
      voice_id: config.voiceId || "eve",
      language: config.language,
      speed: config.voiceSpeed || 1,
    },
    captions: config.captions !== false,
    animate: config.animate === true,
    image_model: config.imageModel || DEFAULT_STICKMAN_IMAGE_MODEL,
    video_model: config.videoModel || DEFAULT_STICKMAN_VIDEO_MODEL,
    beats,
  };
}

function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence?.[1] ?? text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Atlas LLM did not return JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function draftScriptWithAtlas(
  apiKey: string,
  config: StickmanJobConfig,
  project: string,
): Promise<StickmanScript> {
  const n = beatCountForDuration(config.durationSec);
  const fallback = draftScriptTemplate(config, project);
  const prompt = `You write script.json for Stickman Studio, a 2D stick-figure explainer.
Return ONLY JSON matching this schema (no markdown):
project, topic, language, aspect, style="stickman", provider="atlas_cloud",
look, castMode, arc, bible{look,cast:[{name,role,head,accessory,lineColor}],world},
voice{voice_id,language,speed}, captions, animate, image_model, video_model,
beats:[{id,title,pose,scene,narration,durationSec}]

Hard rules:
- ${STICKMAN_STYLE_LOCK}
- Look: ${lookPrompt(config.look)}. Never paper collage. Never 3D hero. Never photoreal.
- Duration ${config.durationSec}s → ${n} beats, 2–6s each, sum ≈ ${config.durationSec}.
- Cast mode ${config.castMode}. Lock the SAME stick figures in bible.cast for every beat.
- Language of narration: ${config.language}. Topic: ${config.topic}. Arc: ${config.arc || recommendArc(config.topic)}.
- Aspect ${config.aspect}. Voice ${config.voiceId}.
- pose describes limb positions of the stick figures only.
- scene is a flat backdrop + at most one geometric prop. No rooms, no collage, no faces with skin.

Base object to fill (keep keys): ${JSON.stringify(fallback).slice(0, 2500)}`;

  const res = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "stickman-studio/0.1 (+https://atlascloud.ai)",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are the Stickman Studio writer. Output JSON only. Never write collage or 3D hero briefs." },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    throw new Error(`Atlas LLM ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content) as StickmanScript;
  if (!Array.isArray(parsed.beats) || parsed.beats.length < 2) {
    throw new Error("Atlas stickman script missing beats");
  }
  return {
    ...fallback,
    ...parsed,
    project,
    style: "stickman",
    provider: "atlas_cloud",
    bible: {
      ...fallback.bible,
      ...parsed.bible,
      cast: parsed.bible?.cast?.length ? parsed.bible.cast : fallback.bible.cast,
    },
    voice: { ...fallback.voice, ...parsed.voice },
    beats: parsed.beats.map((beat, i) => ({
      ...fallback.beats[i],
      ...beat,
      id: i + 1,
      durationSec: Math.max(2, Number(beat.durationSec) || fallback.beats[i]?.durationSec || 3),
    })),
  };
}

export async function draftScript(config: StickmanJobConfig, apiKey?: string): Promise<StickmanScript> {
  const project = `${slug(config.topic)}-${config.durationSec}s`;
  if (apiKey) {
    try {
      return await draftScriptWithAtlas(apiKey, config, project);
    } catch (err) {
      console.warn(`[stickman] Atlas script draft failed, using template: ${err}`);
    }
  }
  return draftScriptTemplate(config, project);
}
