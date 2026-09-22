import {
  formatCastLock,
  formatLocationRoster,
  formatObjectRoster,
} from "../library/identity.js";
import {
  lookPrompt,
  STICKMAN_STYLE_LOCK,
  STICKMAN_VO_HEAD_SEC,
  STICKMAN_VO_TAIL_SEC,
  stickmanArcHint,
  stickmanSpokenWindow,
} from "./catalog.js";
import type { StickmanJobConfig } from "./types.js";

export const HISTORIA_STYLE_LOCK =
  "Cinematic live-action or photoreal illustration of the LOCKED Casting characters, objects, and locations. Same faces, wardrobe, props, and architecture in every beat. NO stick figures, NO line-art palitos, NO collage, NO torn paper, NO identity swap.";

export function isHistoriaConfig(config: StickmanJobConfig): boolean {
  return config.kind === "historia";
}

export function historiaCastLock(config: StickmanJobConfig): string {
  const roster = config.castRoster ?? [];
  if (!roster.length) return "";
  return formatCastLock(
    roster.map((c) => ({
      name: c.name,
      kind: c.kind === "human" || c.kind === "animal" || c.kind === "fictional" ? c.kind : undefined,
      species: c.species || (c.kind === "human" ? "humano" : c.name),
      age: c.age,
      sex: c.sex,
      appearance: c.appearance || c.name,
      personality: c.personality,
      wardrobe: c.wardrobe,
      mustKeep: c.mustKeep,
      mustAvoid: c.mustAvoid,
      notes: c.notes,
      aliases: c.aliases,
    })),
  );
}

export function historiaObjectLock(config: StickmanJobConfig): string {
  return formatObjectRoster(
    (config.objectRoster ?? []).map((o) => ({
      name: o.name,
      prompt: o.prompt,
      notes: o.notes,
      aliases: o.aliases,
    })),
  );
}

export function historiaLocationLock(config: StickmanJobConfig): string {
  return formatLocationRoster(
    (config.locationRoster ?? []).map((l) => ({
      name: l.name,
      place: l.place,
      timeOfDay: l.timeOfDay,
      weather: l.weather,
      mustKeep: l.mustKeep,
      mustAvoid: l.mustAvoid,
      notes: l.notes,
      aliases: l.aliases,
    })),
  );
}

/**
 * Writer contract copied from stickman-video-director (Phase A),
 * not from OpenReels archetypes or Vox collage.
 */
export function stickmanDirectorPrompt(
  config: StickmanJobConfig,
  beatCount: number,
  fallbackJson: string,
): string {
  const arc = stickmanArcHint(config.arc);
  const spokenSec = stickmanSpokenWindow(config.durationSec);
  const wps = 2.3 * (config.voiceSpeed || 1);
  return `You are the Stickman Video Director. You turn a topic into a kinetic 2D stick-figure story.
Return ONLY JSON. No markdown. No OpenReels score. No collage. No film hero.

Source topic: ${config.topic}
Language of spoken narration: ${config.language}
Aspect: ${config.aspect}. Look: ${lookPrompt(config.look)}.
Cast: ${config.castMode}. Arc: ${config.arc} — ${arc}.
Target duration ${config.durationSec}s → exactly ${beatCount} beats. Sum of durationSec ≈ ${config.durationSec}.
Voiceover sits in a ${spokenSec.toFixed(1)}s window (${STICKMAN_VO_HEAD_SEC}s after picture-in, ${STICKMAN_VO_TAIL_SEC}s before picture-out) at speed ${config.voiceSpeed || 1}.
${
  config.muteCharacter
    ? "MUTE CHARACTER: the stick figures do NOT speak. Write short narration only for optional captions. Comedy and information live in the acting, props, and morphs. Sound effects still exist in the picture (impacts, whooshes) because Flow audio is kept."
    : "The character speaks the narration as voiceover over ducked Flow SFX."
}
${
  config.contentHook
    ? "CONTENT HOOK: the FIRST 10 SECONDS are a trailer of the FULL video. Tease the best visual beats and the punchline without delivering them. Beat 1 durationSec MUST be 10. Title it GANCHO. From second 10 onward tell the complete story."
    : ""
}

Choose ONE narrative pattern that fits the source (do not invent a different genre):
- Motivational: hook → recognition → escalation → reframe → action → payoff
- Educational: surprising hook → setup → mechanism → consequence → meaning → takeaway
- Commercial: pain → consequence → reveal → mechanism → proof → benefit
Shape those jobs through the selected arc. Never flatten into a generic OpenReels hook/payoff.

Visual-density recipe (continuous I2V when animate=${config.animate === true}):
- Omni Flash takes are 10s (Veo 8s, Atlas up to 15s). Jobs longer than one clip CHAIN 10s takes: last frame of take N is the first frame of take N+1. Morph across the join. Never cut.
- Each 10s take has in-shot moments: 0–3s establish, 3–7s transform the metaphor, 7–10s climax into the next pose.
- Perceptible visual change every 2–3 seconds. Camera may pan or hold a locked wide/medium. NEVER push-in, pull-in, dolly-in, crash zoom, rack focus, blur, bokeh, or shallow depth of field. Everything stays razor-sharp. Environments MORPH; they do not cut.
- At least four devices per beat: limb acting, environment transform, concrete metaphor, icon-only symbol, particles, pan-or-hold camera, oversized prop.
- Beat N must inherit a visible pose/object/camera motion from beat N-1 (continuity interface).
- ${
    config.animate
      ? "NO jump cuts. One camera path across chained takes. Line-art architecture and oversized props are allowed."
      : "Still frames only. Flat backdrop plus at most one geometric prop."
  }

Voiceover:
- ${config.language.startsWith("en") ? "Natural spoken English" : `Natural spoken ${config.language}`}.
- About ${Math.max(8, Math.round((spokenSec / beatCount) * wps))} words per beat. Total spoken words ≈ ${Math.round(spokenSec * wps)} so the voiceover FITS the ${spokenSec.toFixed(1)}s spoken window (do not overrun). Do not invent facts, stats, quotes, or product claims.
- Narration is audio-only. Never put words, letters, numbers, captions, or UI text in the picture.

Style lock: ${STICKMAN_STYLE_LOCK}
Palette: monochrome stick figures for the look, at most three saturated accent colors named in ordinary words (vivid red, electric blue, warm gold). Never hex/RGB.

JSON keys: project, topic, language, aspect, style="stickman", provider="stickman",
look, castMode, arc, bible{look,cast:[{name,role,head,accessory,lineColor}],world},
voice{voice_id,language,speed}, captions, animate, image_model, video_model,
beats:[{id,title,pose,scene,narration,durationSec}]
pose = limb positions only. scene = the morphing line-art world.

Base object to fill: ${fallbackJson}`;
}

export function historiaDirectorPrompt(
  config: StickmanJobConfig,
  beatCount: number,
  fallbackJson: string,
): string {
  const arc = stickmanArcHint(config.arc);
  const spokenSec = stickmanSpokenWindow(config.durationSec);
  const wps = 2.3 * (config.voiceSpeed || 1);
  const names = (config.castRoster ?? []).map((c) => c.name).join(", ") || "the lead";
  const props = (config.objectRoster ?? []).map((o) => o.name).join(", ");
  const places = (config.locationRoster ?? []).map((l) => l.name).join(", ");
  return `You are the Historia Video Director. You turn a topic into a cinematic story starring ONLY the Casting roster (library characters, objects, locations).
Return ONLY JSON. No markdown. No OpenReels score. No collage. No stick figures.

Source topic: ${config.topic}
Language of spoken narration: ${config.language}
Aspect: ${config.aspect}.
Cast (use these names, do not invent people): ${names}.
${props ? `Locked objects/props: ${props}.` : "No extra hero props unless they appear in the roster."}
${places ? `Locked locations: ${places}. One place per beat; never collage two locations.` : "Invent a simple location that fits the topic, then keep it consistent."}
Arc: ${config.arc} — ${arc}.
Target duration ${config.durationSec}s → exactly ${beatCount} beats. Sum of durationSec ≈ ${config.durationSec}.
Voiceover sits in a ${spokenSec.toFixed(1)}s window (${STICKMAN_VO_HEAD_SEC}s after picture-in, ${STICKMAN_VO_TAIL_SEC}s before picture-out) at speed ${config.voiceSpeed || 1}.
${
  config.muteCharacter
    ? "MUTE CHARACTER: the people on camera do NOT speak. Write short narration only for optional captions. Story lives in acting, props, and camera. Sound effects still exist in the picture because Flow audio is kept."
    : "A narrator speaks the lines as voiceover over ducked Flow SFX. On-camera mouths stay closed unless the beat is clearly a talking head."
}
${
  config.contentHook
    ? "CONTENT HOOK: the FIRST 10 SECONDS are a trailer of the FULL video. Tease the best visual beats and the punchline without delivering them. Beat 1 durationSec MUST be 10. Title it GANCHO. From second 10 onward tell the complete story."
    : ""
}

IDENTITY LOCK (copy into bible.characterLock): ${historiaCastLock(config) || names}
${historiaObjectLock(config) ? `OBJECT LOCK: ${historiaObjectLock(config)}` : ""}
${historiaLocationLock(config) ? `LOCATION LOCK: ${historiaLocationLock(config)}` : ""}

Choose ONE narrative pattern that fits the source (do not invent a different genre):
- Motivational: hook → recognition → escalation → reframe → action → payoff
- Educational: surprising hook → setup → mechanism → consequence → meaning → takeaway
- Commercial: pain → consequence → reveal → mechanism → proof → benefit
Shape those jobs through the selected arc. Never flatten into a generic OpenReels hook/payoff.

Visual-density recipe (continuous I2V when animate=${config.animate === true}):
- Omni Flash takes are 10s (Veo 8s, Atlas up to 15s). Jobs longer than one clip CHAIN 10s takes: last frame of take N is the first frame of take N+1. Morph across the join. Never cut.
- Each 10s take has in-shot moments: 0–3s establish, 3–7s transform, 7–10s climax into the next pose.
- Perceptible visual change every 2–3 seconds. Camera may push/pull/pan/orbit. Environments MORPH; they do not cut.
- Beat N must inherit a visible pose/object/camera motion from beat N-1 (continuity interface).
- ${
    config.animate
      ? "NO jump cuts. One camera path across chained takes. Same faces and wardrobe."
      : "Still frames only. Same faces, same wardrobe, same props."
  }

Voiceover:
- ${config.language.startsWith("en") ? "Natural spoken English" : `Natural spoken ${config.language}`}.
- About ${Math.max(8, Math.round((spokenSec / beatCount) * wps))} words per beat. Total spoken words ≈ ${Math.round(spokenSec * wps)} so the voiceover FITS the ${spokenSec.toFixed(1)}s spoken window (do not overrun). Do not invent facts, stats, quotes, or product claims.
- Narration is audio-only. Never put words, letters, numbers, captions, or UI text in the picture.

Style lock: ${HISTORIA_STYLE_LOCK}

JSON keys: project, topic, language, aspect, style="historia", provider="stickman",
look="casting", castMode, arc, bible{look,cast:[{name,role,head,accessory,lineColor}],world,characterLock,objectLock,locationLock},
voice{voice_id,language,speed}, captions, animate, image_model, video_model,
beats:[{id,title,pose,scene,narration,durationSec}]
pose = body acting of the locked characters. scene = the locked location/world.

Base object to fill: ${fallbackJson}`;
}

export function directorPromptFor(
  config: StickmanJobConfig,
  beatCount: number,
  fallbackJson: string,
): string {
  return isHistoriaConfig(config)
    ? historiaDirectorPrompt(config, beatCount, fallbackJson)
    : stickmanDirectorPrompt(config, beatCount, fallbackJson);
}
