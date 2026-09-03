import type { DirectorScore } from "../schema/director-score.js";

export interface CharacterBible {
  name: string;
  kind?: "human" | "animal" | "fictional";
  species: string;
  age?: string;
  sex?: string;
  appearance: string;
  personality?: string;
  wardrobe?: string;
  mustKeep?: string;
  mustAvoid?: string;
  notes?: string;
}

const IDENTITY_MARKER = "IDENTITY LOCK:";

export function formatCharacterLock(c: CharacterBible): string {
  const lines = [
    `Name: ${c.name.trim()}`,
    c.kind ? `Kind: ${c.kind}` : "",
    `Species/race (LOCKED, never substitute a similar animal): ${c.species.trim()}`,
    c.age?.trim() ? `Age: ${c.age.trim()}` : "",
    c.sex?.trim() ? `Sex: ${c.sex.trim()}` : "",
    `Appearance (markings, colors, face — copy exactly): ${c.appearance.trim()}`,
    c.wardrobe?.trim() ? `Wardrobe/accessories: ${c.wardrobe.trim()}` : "",
    c.personality?.trim() ? `Personality visible in pose/expression: ${c.personality.trim()}` : "",
    c.mustKeep?.trim() ? `MUST keep: ${c.mustKeep.trim()}` : "",
    c.mustAvoid?.trim() ? `MUST avoid (do not morph into these): ${c.mustAvoid.trim()}` : "",
    c.notes?.trim() ? `Notes: ${c.notes.trim()}` : "",
  ].filter(Boolean);
  return lines.join(". ");
}

export function characterDirectionBlock(c: CharacterBible): string {
  return [
    "## Personaje (identidad bloqueada)",
    formatCharacterLock(c),
    "El mismo individuo en TODAS las escenas. No cambies especie, raza, edad, marcas ni cara. El contraste va por encuadre, luz y emoción, nunca por otro animal.",
  ].join("\n");
}

function prefixIdentity(prompt: string, lock: string): string {
  if (prompt.includes(IDENTITY_MARKER)) return prompt;
  return `${IDENTITY_MARKER} same individual every shot. ${lock}. SCENE: ${prompt}`;
}

const STILL = new Set(["ai_image", "stock_image", "text_card"]);
const MOTION = new Set(["ai_video", "stock_video"]);

/** Lock species/identity in prompts and smooth still↔motion cuts so the video does not freeze. */
export function applyVisualIdentity(
  score: DirectorScore,
  characterLock?: string,
): DirectorScore {
  const lock = characterLock?.trim();
  const scenes = score.scenes.map((scene, i) => {
    const next = score.scenes[i + 1];
    let visual_prompt = scene.visual_prompt;
    if (lock && (scene.visual_type === "ai_image" || scene.visual_type === "ai_video")) {
      visual_prompt = prefixIdentity(visual_prompt, lock);
    }

    let motion = scene.motion;
    if ((scene.visual_type === "ai_image" || scene.visual_type === "stock_image") && motion === "static") {
      motion = "zoom_in";
    }

    let transition = scene.transition;
    const last = i === score.scenes.length - 1;
    if (!last && next) {
      const stillToMotion = STILL.has(scene.visual_type) && MOTION.has(next.visual_type);
      const motionToStill = MOTION.has(scene.visual_type) && STILL.has(next.visual_type);
      if (stillToMotion || motionToStill || transition == null || transition === "none") {
        transition = "crossfade";
      }
    }

    return { ...scene, visual_prompt, motion, transition };
  });

  return { ...score, scenes };
}
