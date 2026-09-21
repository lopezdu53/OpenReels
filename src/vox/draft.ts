import type { VoxBeat, VoxBeatsDoc, VoxJobConfig, VoxShot } from "./types.js";
import {
  AROLL_FALLBACK_MODEL,
  AROLL_VIDEO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_VIDEO_MODEL,
  KLING_VIDEO_MODEL,
  beatCountForDuration,
  recommendArc,
} from "./catalog.js";

const CAMERAS = ["push_in", "pan", "parallax", "tilt", "pull_out", "static"] as const;
const SIZES = ["WIDE", "MEDIUM", "CLOSE", "DETAIL"] as const;
const HOOKS = ["surprising_stat", "direct_question", "pain_point", "outcome_tease"] as const;

function slug(topic: string): string {
  return topic
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "vox-film";
}

function shot(id: string, i: number, beat: number, topic: string, title: boolean, dur: number): VoxShot {
  const cam = CAMERAS[(beat + i) % (CAMERAS.length - 1)]!;
  const size = title ? "WIDE" : SIZES[(i + 1) % SIZES.length]!;
  return {
    id,
    dur,
    title,
    shot_size: size,
    camera_move: beat > 0 && i === 0 ? cam : cam,
    scene: title
      ? `paper-collage poster of ${topic}, wide establishing cut-outs, torn edges, tape, halftone, bold headline space`
      : `close paper-collage detail of ${topic}, one hero cut-out filling the frame, torn paper, tape`,
    element_motion: title
      ? "cut-outs settle, tape curls, a paper scrap drifts across, halftone pulses"
      : "the hero sticker slaps in, edges flutter, a stamp ink-stamps once",
  };
}

export function draftBeatsTemplate(config: VoxJobConfig, project: string): VoxBeatsDoc {
  const { beats: n, shotsPerBeat } = beatCountForDuration(config.durationSec);
  const shotDur = Math.max(3, Math.round(config.durationSec / (n * shotsPerBeat)));
  const arc = config.arc || recommendArc(config.topic);
  const beats: VoxBeat[] = [];
  for (let i = 0; i < n; i++) {
    const shots: VoxShot[] = [];
    shots.push(shot("a", 0, i, config.topic, true, shotDur));
    if (shotsPerBeat > 1) shots.push(shot("b", 1, i, config.topic, false, shotDur));
    beats.push({
      id: i + 1,
      title_cn: "",
      title_en: i === 0 ? config.topic.slice(0, 22).toUpperCase() : `BEAT ${i + 1}`,
      bg: ["warm ochre", "bold red", "cold teal", "cream newsprint", "mustard", "ink black"][i % 6]!,
      feel: i === 0 ? "hook, punchy" : i === n - 1 ? "payoff, still" : "building",
      hook: i === 0 ? HOOKS[0] : undefined,
      narration:
        i === 0
          ? `${config.topic}. Esto no es lo que te contaron.`
          : i === n - 1
            ? `Eso es ${config.topic}. Recuérdalo.`
            : `Siguiente pieza de ${config.topic}, un corte, un dato.`,
      shots,
    });
  }

  const videoModel = config.realPeople
    ? KLING_VIDEO_MODEL
    : config.mode === "aroll"
      ? AROLL_VIDEO_MODEL
      : config.videoModel || DEFAULT_VIDEO_MODEL;

  return {
    project,
    topic: config.topic,
    language: config.language,
    aspect: config.aspect,
    style: "collage",
    provider: "atlas_cloud",
    arc,
    video_model: videoModel,
    video_model_fallback: config.mode === "aroll" ? AROLL_FALLBACK_MODEL : undefined,
    image_model: config.imageModel || DEFAULT_IMAGE_MODEL,
    image_resolution: "1k",
    video_resolution: "720p",
    motion_style: config.motionStyle || "punchy",
    constraints: config.constraints || "strict",
    voice: {
      voice_id: config.voiceId || "leo",
      language: config.language,
      speed: config.voiceSpeed || 1,
    },
    music: config.music || "editorial documentary, paper-texture percussion, instrumental, no vocals",
    mix: { music: 0.6, voice: 1.25 },
    caption_style: config.captionStyle || "white",
    captions: config.captions !== false,
    watermark: config.watermark || "Made with Atlas Cloud · vox-director",
    aspect_approx_confirmed: true,
    ...(config.mode === "croll"
      ? {
          mode: "croll" as const,
          croll_subject: config.crollSubject ?? "portrait",
          subject_wardrobe: config.subjectWardrobe,
          subject_desc: config.subjectDesc,
        }
      : config.mode === "aroll"
        ? { mode: "aroll" as const }
        : { mode: "broll" as const }),
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

export async function draftBeatsWithAtlas(
  apiKey: string,
  config: VoxJobConfig,
  project: string,
): Promise<VoxBeatsDoc> {
  const { beats, shotsPerBeat } = beatCountForDuration(config.durationSec);
  const fallback = draftBeatsTemplate(config, project);
  const prompt = `You write beats.json for Vox Director paper-collage films.
Return ONLY JSON matching this schema (no markdown):
project, topic, language, aspect, style="collage", provider="atlas_cloud",
arc, theme (optional), video_model, image_model, image_resolution="1k",
video_resolution="720p", motion_style, constraints, voice{voice_id,language,speed},
music, captions, caption_style, watermark, aspect_approx_confirmed=true,
beats:[{id,title_cn,title_en,bg,feel,hook,narration,shots:[{id,dur,title,shot_size,camera_move,scene,element_motion}]}]

Rules from the skill:
- Beat 1 headline is a ≤3s hook. Never spend beat 1 on setup.
- Duration ${config.durationSec}s → ${beats} beats, ${shotsPerBeat} shot(s) each, 3–6s per shot.
- Adjacent camera_move MUST vary. static only on the payoff.
- element_motion is RICH and unique per shot (not a template). Occasional hero flyer, not every shot.
- Wide shot title=true; detail shot title=false.
- Language of narration: ${config.language}. Topic: ${config.topic}. Arc: ${config.arc || recommendArc(config.topic)}.
- Aspect ${config.aspect}. Voice ${config.voiceId}. Mode ${config.mode}.
- scene describes a FINISHED collage poster (torn paper, tape, halftone, cut-out headlines).

Base object to fill (keep keys): ${JSON.stringify(fallback).slice(0, 2500)}`;

  const res = await fetch("https://api.atlascloud.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "vox-director/0.1 (+https://atlascloud.ai)",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: "You are the Vox Director beat writer. Output JSON only." },
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
  const parsed = extractJson(content) as VoxBeatsDoc;
  if (!Array.isArray(parsed.beats) || parsed.beats.length < 2) {
    throw new Error("Atlas beat map missing beats");
  }
  return {
    ...fallback,
    ...parsed,
    project,
    style: "collage",
    provider: "atlas_cloud",
    aspect_approx_confirmed: true,
    voice: { ...fallback.voice, ...parsed.voice },
  };
}

export async function draftBeats(config: VoxJobConfig, apiKey?: string): Promise<VoxBeatsDoc> {
  const project = `${slug(config.topic)}-${config.durationSec}s`;
  if (apiKey) {
    try {
      return await draftBeatsWithAtlas(apiKey, config, project);
    } catch (err) {
      console.warn(`[vox] Atlas beat draft failed, using template: ${err}`);
    }
  }
  return draftBeatsTemplate(config, project);
}
