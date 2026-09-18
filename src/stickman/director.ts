import {
  lookPrompt,
  STICKMAN_STYLE_LOCK,
  STICKMAN_VO_HEAD_SEC,
  STICKMAN_VO_TAIL_SEC,
  stickmanArcHint,
  stickmanSpokenWindow,
} from "./catalog.js";
import type { StickmanJobConfig } from "./types.js";

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
- Perceptible visual change every 2–3 seconds. Camera may push/pull/pan/orbit. Environments MORPH; they do not cut.
- At least four devices per beat: limb acting, environment transform, concrete metaphor, icon-only symbol, particles, camera move, oversized prop.
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
