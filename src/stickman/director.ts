import { lookPrompt, STICKMAN_STYLE_LOCK, stickmanArcHint } from "./catalog.js";
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
  return `You are the Stickman Video Director. You turn a topic into a kinetic 2D stick-figure story.
Return ONLY JSON. No markdown. No OpenReels score. No collage. No film hero.

Source topic: ${config.topic}
Language of spoken narration: ${config.language}
Aspect: ${config.aspect}. Look: ${lookPrompt(config.look)}.
Cast: ${config.castMode}. Arc: ${config.arc} — ${arc}.
Target duration ${config.durationSec}s → exactly ${beatCount} beats. Sum of durationSec ≈ ${config.durationSec}.

Choose ONE narrative pattern that fits the source (do not invent a different genre):
- Motivational: hook → recognition → escalation → reframe → action → payoff
- Educational: surprising hook → setup → mechanism → consequence → meaning → takeaway
- Commercial: pain → consequence → reveal → mechanism → proof → benefit
Shape those jobs through the selected arc. Never flatten into a generic OpenReels hook/payoff.

Visual-density recipe (inside ONE continuous take when animate=${config.animate === true}):
- Each beat has three in-shot moments: 0–3s establish, 3–7s transform the metaphor, 7–10s climax into the next pose.
- Perceptible visual change every 2–3 seconds. Camera may push/pull/pan/orbit. Environments MORPH; they do not cut.
- At least four devices per beat: limb acting, environment transform, concrete metaphor, icon-only symbol, particles, camera move, oversized prop.
- Beat N must inherit a visible pose/object/camera motion from beat N-1 (continuity interface).
- ${
    config.animate
      ? "NO jump cuts. One camera take. Line-art architecture and oversized props are allowed."
      : "Still frames only. Flat backdrop plus at most one geometric prop."
  }

Voiceover:
- ${config.language.startsWith("en") ? "Natural spoken English" : `Natural spoken ${config.language}`}.
- ~18–25 words per beat. Do not invent facts, stats, quotes, or product claims.
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
