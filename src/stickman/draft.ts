import {
  beatCountForDuration,
  DEFAULT_STICKMAN_IMAGE_MODEL,
  DEFAULT_STICKMAN_LLM,
  DEFAULT_STICKMAN_VIDEO_MODEL,
  recommendArc,
} from "./catalog.js";
import { llmUsageFromAtlas, type StickmanLlmUsage } from "./cost.js";
import {
  directorPromptFor,
  historiaCastLock,
  historiaLocationLock,
  historiaObjectLock,
  isHistoriaConfig,
} from "./director.js";
import type {
  StickmanBeat,
  StickmanCastMember,
  StickmanJobConfig,
  StickmanScript,
} from "./types.js";

function slug(topic: string): string {
  return (
    topic
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "story"
  );
}

function defaultCast(config: StickmanJobConfig): StickmanCastMember[] {
  if (isHistoriaConfig(config) && (config.castRoster?.length ?? 0) > 0) {
    return (config.castRoster ?? []).slice(0, 3).map((member, i) => ({
      name: member.name,
      role: i === 0 ? "hero" : "partner",
      head: "circle",
      accessory: member.wardrobe?.trim() || "none",
      lineColor: "natural",
    }));
  }
  const hero: StickmanCastMember = {
    name: "Palo",
    role: "hero",
    head: "circle",
    accessory: "none",
    lineColor: "black",
  };
  if (config.castMode !== "duo") return [hero];
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

function hookNarration(topic: string, language: string): string {
  if (language.startsWith("en")) return `In the next minutes: ${topic}. Stay.`;
  return `En los próximos minutos: ${topic}. Quédate.`;
}

function beatTitle(i: number, n: number, arc: string, names: string[]): string {
  if (i === 0) return "HOOK";
  if (i === n - 1) return "PAYOFF";
  if (arc === "listicle") return `PUNTO ${i}`;
  if (arc === "vs_debate") {
    const a = names[0] ?? "PALO";
    const b = names[1] ?? names[0] ?? "LÍNEA";
    return i % 2 === 1 ? a.toUpperCase() : b.toUpperCase();
  }
  return `BEAT ${i + 1}`;
}

function beatPose(i: number, n: number, config: StickmanJobConfig): string {
  const names = (config.castRoster ?? []).map((c) => c.name);
  const hero = names[0] ?? (isHistoriaConfig(config) ? "Protagonista" : "Palo");
  const partner = names[1] ?? (isHistoriaConfig(config) ? hero : "Línea");
  const prop = config.objectRoster?.[0]?.name;
  if (config.castMode === "duo" || names.length > 1) {
    return i % 2 === 0
      ? `${hero} points at ${prop ?? "a concrete prop"} while ${partner} leans in`
      : `${partner} shrugs; ${hero} stands opposite`;
  }
  if (i === 0) return `${hero} steps into frame and looks at the viewer`;
  if (i === n - 1) return `${hero} holds a still, one small victory beat`;
  return [
    `${hero} walks left to right`,
    `${hero} holds ${prop ?? "a concrete prop"}`,
    `${hero} turns and reacts`,
  ][i % 3]!;
}

function beatNarration(i: number, n: number, topic: string, language: string, historia: boolean): string {
  if (language.startsWith("en")) {
    if (i === 0) return historia ? `${topic}. Watch who this is.` : `${topic}. Drawn with two lines and a circle.`;
    if (i === n - 1) return historia ? `That's ${topic}. Remember the faces.` : `That's ${topic}. Stick figures remember.`;
    return historia ? `Next beat of ${topic}.` : `Next beat of ${topic}, still just lines.`;
  }
  if (i === 0) return historia ? `${topic}. Mira quién es.` : `${topic}. Dos palitos y un círculo.`;
  if (i === n - 1) return historia ? `Eso es ${topic}. Las caras no cambian.` : `Eso es ${topic}. Los palitos no olvidan.`;
  return historia ? `Siguiente beat de ${topic}.` : `Siguiente palito de ${topic}.`;
}

function templateBeats(config: StickmanJobConfig): StickmanBeat[] {
  const n = beatCountForDuration(config.durationSec);
  const hook = config.contentHook === true;
  const remaining = hook ? Math.max(2, config.durationSec - 10) : config.durationSec;
  const storyBeats = hook ? Math.max(1, n - 1) : n;
  const dur = Math.max(2, Math.round(remaining / storyBeats));
  const look = config.look || (isHistoriaConfig(config) ? "casting" : "classic");
  const historia = isHistoriaConfig(config);
  const names = (config.castRoster ?? []).map((c) => c.name);
  const place = config.locationRoster?.[0]?.place || config.locationRoster?.[0]?.name;
  const beats: StickmanBeat[] = [];
  for (let i = 0; i < n; i++) {
    const isHook = hook && i === 0;
    const storyIndex = hook ? Math.max(0, i - 1) : i;
    beats.push({
      id: i + 1,
      title: isHook ? "GANCHO" : beatTitle(storyIndex, storyBeats, config.arc, names),
      pose: beatPose(storyIndex, storyBeats, config),
      scene: isHook
        ? `rapid tease of the full story about ${config.topic}, then morph into the opening`
        : historia
          ? `${place || "cinematic location"}, same locked faces, about ${config.topic}`
          : `empty ${look} ground line, one simple geometric prop about ${config.topic}`,
      narration: isHook
        ? hookNarration(config.topic, config.language)
        : beatNarration(storyIndex, storyBeats, config.topic, config.language, historia),
      durationSec: isHook ? 10 : dur,
    });
  }
  return beats;
}

export function draftScriptTemplate(config: StickmanJobConfig, project: string): StickmanScript {
  const arc = config.arc || recommendArc(config.topic);
  const historia = isHistoriaConfig(config);
  const look = config.look || (historia ? "casting" : "classic");
  const place = config.locationRoster?.[0];
  return {
    project,
    topic: config.topic,
    language: config.language,
    aspect: config.aspect,
    style: historia ? "historia" : "stickman",
    provider: "atlas_cloud",
    look,
    castMode: config.castMode,
    arc,
    bible: {
      look,
      cast: defaultCast(config),
      world: historia
        ? place?.place || place?.name || "cinematic location consistent with the locked cast"
        : `flat ${look} backdrop, one horizon line, no furniture catalog, no photoreal room`,
      characterLock: historia ? historiaCastLock(config) : undefined,
      objectLock: historia ? historiaObjectLock(config) : undefined,
      locationLock: historia ? historiaLocationLock(config) : undefined,
    },
    voice: {
      voice_id: config.voiceId || "eve",
      language: config.language,
      speed: config.voiceSpeed || 1,
    },
    captions: config.captions === true,
    animate: config.animate === true,
    muteCharacter: config.muteCharacter === true,
    contentHook: config.contentHook === true,
    image_model: config.imageModel || DEFAULT_STICKMAN_IMAGE_MODEL,
    video_model: config.videoModel || DEFAULT_STICKMAN_VIDEO_MODEL,
    beats: templateBeats({ ...config, arc, look }),
  };
}

export function lockStickmanVoice(
  fallback: StickmanScript["voice"],
  parsed: Partial<StickmanScript["voice"]> | undefined,
  config: StickmanJobConfig,
): StickmanScript["voice"] {
  return {
    ...fallback,
    ...parsed,
    voice_id: config.voiceId || fallback.voice_id,
    language: config.language || parsed?.language || fallback.language,
    speed: config.voiceSpeed || parsed?.speed || fallback.speed || 1,
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
): Promise<{ script: StickmanScript; usage?: StickmanLlmUsage }> {
  const n = beatCountForDuration(config.durationSec);
  const fallback = draftScriptTemplate(config, project);
  const prompt = directorPromptFor(config, n, JSON.stringify(fallback).slice(0, 2500));
  const model = config.llmModel || DEFAULT_STICKMAN_LLM;

  const res = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "stickman-studio/0.1 (+https://atlascloud.ai)",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: isHistoriaConfig(config)
            ? "You are the Historia Video Director. Output JSON only. Use only the Casting roster. Never write stick figures, OpenReels scores, or collage briefs."
            : "You are the Stickman Video Director. Output JSON only. Never write OpenReels, collage, or 3D hero briefs.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
    }),
  });
  if (!res.ok) {
    throw new Error(`Atlas LLM ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  const parsed = extractJson(content) as StickmanScript;
  if (!Array.isArray(parsed.beats) || parsed.beats.length < 2) {
    throw new Error("Atlas stickman script missing beats");
  }
  return {
    usage: llmUsageFromAtlas(data.usage),
    script: {
      ...fallback,
      ...parsed,
      project,
      style: isHistoriaConfig(config) ? "historia" : "stickman",
      provider: "atlas_cloud",
      muteCharacter: config.muteCharacter === true,
      contentHook: config.contentHook === true,
      captions: config.captions === true,
      bible: {
        ...fallback.bible,
        ...parsed.bible,
        cast: parsed.bible?.cast?.length ? parsed.bible.cast : fallback.bible.cast,
        characterLock: fallback.bible.characterLock || parsed.bible?.characterLock,
        objectLock: fallback.bible.objectLock || parsed.bible?.objectLock,
        locationLock: fallback.bible.locationLock || parsed.bible?.locationLock,
      },
      voice: lockStickmanVoice(fallback.voice, parsed.voice, config),
      beats: parsed.beats.map((beat, i) => ({
        ...fallback.beats[i],
        ...beat,
        id: i + 1,
        durationSec: Math.max(2, Number(beat.durationSec) || fallback.beats[i]?.durationSec || 3),
      })),
    },
  };
}

export async function draftScript(
  config: StickmanJobConfig,
  apiKey?: string,
): Promise<{ script: StickmanScript; usage?: StickmanLlmUsage }> {
  const project = `${slug(config.topic)}-${config.durationSec}s`;
  if (apiKey) {
    try {
      return await draftScriptWithAtlas(apiKey, config, project);
    } catch (err) {
      console.warn(`[stickman] Atlas script draft failed, using template: ${err}`);
    }
  }
  return { script: draftScriptTemplate(config, project) };
}
